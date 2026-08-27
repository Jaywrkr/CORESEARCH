import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFParse } from "pdf-parse";
import { rawTable, glideApp, projectsTable } from "./glideClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const relationsPath = join(__dirname, "relations.json");

// Valores de codigoProyecto que en la práctica son basura: headers de página
// u otro texto capturado como si fuera una fila real (ej. "Proyecto" cuando
// se filtró/copió la propia cabecera de la tabla en Glide).
const CODIGOS_BASURA = new Set(["proyecto", "código", "codigo", "cliente", "estado", "n/a"]);

export function esFilaBasura(p) {
  const codigo = (p.codigoProyecto ?? "").trim().toLowerCase();
  if (!codigo) return true;
  if (CODIGOS_BASURA.has(codigo)) return true;
  if (codigo.startsWith("versión") || codigo.startsWith("version")) return true;
  return false;
}

export function loadRelations() {
  return JSON.parse(readFileSync(relationsPath, "utf-8"));
}

// -----------------------------------------------------------------------
// Helpers genéricos
// -----------------------------------------------------------------------

function matchKey(row, campo) {
  const keys = Object.keys(row ?? {});
  if (keys.includes(campo)) return campo;
  const lower = campo.toLowerCase();
  return keys.find((k) => k.toLowerCase() === lower);
}

function includesCI(value, needle) {
  return String(value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function inDateRange(value, desde, hasta) {
  if (!value) return !desde && !hasta;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  if (desde && t < new Date(desde).getTime()) return false;
  if (hasta && t > new Date(hasta).getTime()) return false;
  return true;
}

function daysAgo(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/**
 * Expande un término de búsqueda (nombre corto, nombre completo, o alias)
 * a todas sus variantes conocidas según un diccionario de alias tipo
 * { claveCorta: ["variante1", "variante2", ...] }. Sirve para no perder
 * matches por diferencias de formato (ej. "Luis Miguel S" vs
 * "Luis Miguel Serrano", o "SUKASA" vs "COMOHOGAR (SUKASA)").
 */
function expandAliases(term, aliasMap) {
  const variantes = new Set([term]);
  const lower = term.toLowerCase();
  for (const [clave, lista] of Object.entries(aliasMap ?? {})) {
    if (clave.startsWith("_")) continue;
    const listaVariantes = Array.isArray(lista) ? lista : [];
    if (clave.toLowerCase() === lower || listaVariantes.some((v) => v.toLowerCase() === lower)) {
      variantes.add(clave);
      for (const v of listaVariantes) variantes.add(v);
    }
  }
  return [...variantes];
}

function matchesAny(value, variantes) {
  const v = String(value ?? "").toLowerCase();
  return variantes.some((variante) => v.includes(variante.toLowerCase()));
}

/**
 * Verifica que una tabla de relations.json tenga tableId y las claves
 * pedidas ya resueltas. Si falta algo, devuelve { ok: false, error } con
 * instrucciones concretas de qué completar.
 */
function requireTableConfig(relations, tableKey, camposRequeridos = []) {
  const cfg = relations.tablas?.[tableKey];
  if (!cfg) {
    return { ok: false, error: `No existe la entrada "${tableKey}" en relations.json.` };
  }
  if (!cfg.tableId) {
    return {
      ok: false,
      error: `Falta el tableId de "${cfg.nombre ?? tableKey}" en relations.json.`,
    };
  }
  const faltantes = camposRequeridos.filter((campo) => !cfg.claves?.[campo]);
  if (faltantes.length > 0) {
    return {
      ok: false,
      error:
        `Faltan mapear columnas de "${cfg.nombre ?? tableKey}" en relations.json: ` +
        `${faltantes.join(", ")}. Usá obtener_filas con tableId "${cfg.tableId}" para confirmar ` +
        `y completá tablas.${tableKey}.claves en relations.json.`,
    };
  }
  return { ok: true, cfg };
}

async function fetchMapped(cfg, camposRequeridos = []) {
  const rows = await rawTable(cfg.tableId).get();
  return rows.map((row) => {
    const out = {};
    for (const campo of camposRequeridos) {
      out[campo] = row[cfg.claves[campo]] ?? null;
    }
    return out;
  });
}

// -----------------------------------------------------------------------
// 1-3: tools genéricas de solo lectura, sin configuración previa
// -----------------------------------------------------------------------

export async function obtenerFilas(tableId, limite = 5, offset = 0) {
  const rows = await rawTable(tableId).get();
  const pagina = rows.slice(offset, offset + limite);
  return { total_filas: rows.length, offset, devueltos: pagina.length, filas: pagina };
}

export async function buscarFilas(tableId, campo, valor, limite = 10) {
  const rows = await rawTable(tableId).get();
  const key = matchKey(rows[0], campo);
  if (!key) {
    return {
      error: `No se encontró una columna que matchee "${campo}".`,
      columnas_disponibles: Object.keys(rows[0] ?? {}),
    };
  }
  const filtered = rows.filter((row) => includesCI(row[key], valor));
  return {
    columna_usada: key,
    total_encontrados: filtered.length,
    filas: filtered.slice(0, limite),
  };
}

export async function buscarTextoGlobal(texto, tablaIds, limitePorTabla = 5) {
  let objetivos;
  if (tablaIds && tablaIds.length > 0) {
    objetivos = tablaIds.map((id) => ({ id, name: id, table: rawTable(id) }));
  } else {
    const todas = await glideApp.getTables();
    objetivos = (todas ?? []).map((t) => ({ id: t.id, name: t.name, table: t }));
  }

  const resultados = [];
  for (const { id, name, table } of objetivos) {
    let rows;
    try {
      rows = await table.get();
    } catch (err) {
      resultados.push({ tabla: name, tableId: id, error: String(err?.message ?? err) });
      continue;
    }
    const coincidencias = rows
      .filter((row) => Object.values(row).some((v) => includesCI(v, texto)))
      .slice(0, limitePorTabla);
    if (coincidencias.length > 0) {
      resultados.push({ tabla: name, tableId: id, coincidencias });
    }
  }
  return resultados;
}

// -----------------------------------------------------------------------
// 4: obtener_proyecto_completo
// -----------------------------------------------------------------------

export async function obtenerProyectoCompleto(nroProyecto) {
  const relations = loadRelations();
  const proyectos = await projectsTable.get();
  const proyecto = proyectos.find(
    (p) => (p.codigoProyecto ?? "").toLowerCase() === nroProyecto.toLowerCase()
  );

  const resultado = { nroProyecto, proyecto: proyecto ?? null, secciones: {} };
  if (!proyecto) {
    resultado.aviso = `No se encontró un proyecto con codigoProyecto exactamente "${nroProyecto}" en Proyectos Planificacion.`;
  }

  for (const [tableKey, seccion, camposExtra] of [
    ["actividades_planificacion", "actividades", ["personal", "fecha", "horas"]],
    ["cronograma_planificacion", "cronograma", ["personal", "fechaCreacion", "fechaTrabajo", "estatus"]],
    ["equipos_proyecto", "equiposAsignados", []],
    [
      "proyectos_gestion",
      "gestion",
      [
        "cliente",
        "descripcion",
        "nroContrato",
        "referenciaOpi",
        "fechaPrincipal",
        "fechaSecundaria",
        "plazoDias",
        "fechaActa",
        "monto",
        "estatus",
        "formaPago",
        "administrador",
      ],
    ],
  ]) {
    const check = requireTableConfig(relations, tableKey, ["nroProyecto", ...camposExtra]);
    if (!check.ok) {
      resultado.secciones[seccion] = { disponible: false, motivo: check.error };
      continue;
    }
    const rows = await fetchMapped(check.cfg, ["nroProyecto", ...camposExtra]);
    const propias = rows.filter((r) => includesCI(r.nroProyecto, nroProyecto));
    resultado.secciones[seccion] = { disponible: true, filas: propias };
  }

  // Tickets no tiene columna Nro Proyecto (se vincula por Cliente): join
  // aproximado usando el cliente del proyecto ya encontrado.
  const ticketsCheck = requireTableConfig(relations, "tickets_planificacion", [
    "cliente",
    "estatus",
    "fechaCreacion",
    "codigoTicket",
  ]);
  if (!ticketsCheck.ok) {
    resultado.secciones.tickets = { disponible: false, motivo: ticketsCheck.error };
  } else if (!proyecto?.clienteProyecto) {
    resultado.secciones.tickets = {
      disponible: false,
      motivo: "Tickets se vincula por Cliente, no por Nro Proyecto, y no se encontró el proyecto (o su cliente) para cruzar.",
    };
  } else {
    const variantesCliente = expandAliases(proyecto.clienteProyecto, relations.alias_cliente);
    const rows = await fetchMapped(ticketsCheck.cfg, ["cliente", "estatus", "fechaCreacion", "codigoTicket"]);
    resultado.secciones.tickets = {
      disponible: true,
      notas: "Join aproximado por cliente del proyecto (Tickets no referencia Nro Proyecto directamente).",
      filas: rows.filter((r) => matchesAny(r.cliente, variantesCliente)),
    };
  }

  // Órdenes de compra se vinculan por OPI (no por Nro Proyecto).
  const ordenesCheck = requireTableConfig(relations, "control_ordenes_compra_track", ["opi", "cliente", "personal"]);
  if (!ordenesCheck.ok) {
    resultado.secciones.ordenesCompra = { disponible: false, motivo: ordenesCheck.error };
  } else if (!proyecto?.opi) {
    resultado.secciones.ordenesCompra = {
      disponible: false,
      motivo: "El proyecto no tiene OPI cargado (o no se encontró el proyecto), y las órdenes de compra se vinculan por OPI.",
    };
  } else {
    const rows = await fetchMapped(ordenesCheck.cfg, ["opi", "cliente", "personal"]);
    resultado.secciones.ordenesCompra = {
      disponible: true,
      opi: proyecto.opi,
      filas: rows.filter((r) => includesCI(r.opi, proyecto.opi)),
    };
  }

  if (resultado.secciones.actividades?.disponible) {
    resultado.horasTotales = resultado.secciones.actividades.filas.reduce(
      (acc, r) => acc + (Number(r.horas) || 0),
      0
    );
  }

  return resultado;
}

// -----------------------------------------------------------------------
// 5: obtener_cliente_resumen
// -----------------------------------------------------------------------

export async function obtenerClienteResumen(cliente) {
  const relations = loadRelations();
  const variantes = expandAliases(cliente, relations.alias_cliente);

  const proyectos = await projectsTable.get();
  const propios = proyectos.filter((p) => !esFilaBasura(p) && matchesAny(p.clienteProyecto, variantes));

  const resultado = {
    cliente,
    variantesConsideradas: variantes,
    proyectos: propios.map((p) => ({
      codigo: p.codigoProyecto,
      cliente: p.clienteProyecto,
      estado: p.estado,
      fechaCreacion: p.fechaCreacion,
    })),
    secciones: {},
  };

  const contactosCheck = requireTableConfig(relations, "clientes_personal_planificacion", ["cliente"]);
  if (!contactosCheck.ok) {
    resultado.secciones.contactos = { disponible: false, motivo: contactosCheck.error };
  } else {
    const rows = await fetchMapped(contactosCheck.cfg, ["cliente"]);
    resultado.secciones.contactos = { disponible: true, filas: rows.filter((r) => matchesAny(r.cliente, variantes)) };
  }

  const ticketsCheck = requireTableConfig(relations, "tickets_planificacion", [
    "cliente",
    "estatus",
    "fechaCreacion",
    "codigoTicket",
  ]);
  if (!ticketsCheck.ok) {
    resultado.secciones.tickets = { disponible: false, motivo: ticketsCheck.error };
  } else {
    const rows = await fetchMapped(ticketsCheck.cfg, ["cliente", "estatus", "fechaCreacion", "codigoTicket"]);
    resultado.secciones.tickets = { disponible: true, filas: rows.filter((r) => matchesAny(r.cliente, variantes)) };
  }

  // Contadores precalculados por Glide (rollups) — fuente principal.
  const contadoresCheck = requireTableConfig(relations, "clientes_general", [
    "cliente",
    "categoria",
    "nroProyectos",
    "nroOportunidades",
    "oportunidadesGanadas",
    "oportunidadesPerdidas",
    "oportunidadesDetectadas",
    "proyectosEnCurso",
    "proyectosTerminados",
  ]);
  if (!contadoresCheck.ok) {
    resultado.secciones.contadores = { disponible: false, motivo: contadoresCheck.error };
  } else {
    const rows = await fetchMapped(contadoresCheck.cfg, [
      "cliente",
      "categoria",
      "nroProyectos",
      "nroOportunidades",
      "oportunidadesGanadas",
      "oportunidadesPerdidas",
      "oportunidadesDetectadas",
      "proyectosEnCurso",
      "proyectosTerminados",
    ]);
    const fila = rows.find((r) => matchesAny(r.cliente, variantes));
    resultado.secciones.contadores = fila
      ? { disponible: true, notas: "Contadores precalculados por Glide en CLIENTES GENERAL.", ...fila }
      : { disponible: false, motivo: `No se encontró "${cliente}" en CLIENTES GENERAL.` };
  }

  // Detalle de licitaciones/oportunidades públicas individuales (complementa
  // los contadores de arriba con el listado concreto).
  const oportunidadesCheck = requireTableConfig(relations, "compras_publicas_planificacion", [
    "cliente",
    "objeto",
    "estadoOportunidad",
    "fechaResultado",
  ]);
  if (!oportunidadesCheck.ok) {
    resultado.secciones.oportunidadesDetalle = { disponible: false, motivo: oportunidadesCheck.error };
  } else {
    const rows = await fetchMapped(oportunidadesCheck.cfg, [
      "cliente",
      "objeto",
      "estadoOportunidad",
      "fechaResultado",
    ]);
    resultado.secciones.oportunidadesDetalle = {
      disponible: true,
      notas: "Licitaciones/oportunidades públicas individuales (tabla Compras Publicas Planificacion).",
      filas: rows.filter((r) => matchesAny(r.cliente, variantes)),
    };
  }

  return resultado;
}

// -----------------------------------------------------------------------
// 6: obtener_personal_resumen
// -----------------------------------------------------------------------

export async function obtenerPersonalResumen(nombre) {
  const relations = loadRelations();
  const variantes = expandAliases(nombre, relations.alias_personal);
  const resultado = { nombre, variantesConsideradas: variantes, secciones: {} };

  const certCheck = requireTableConfig(relations, "capacitaciones_planificacion", [
    "personal",
    "expiracion",
    "marca",
    "estatus",
  ]);
  if (!certCheck.ok) {
    resultado.secciones.certificaciones = { disponible: false, motivo: certCheck.error };
  } else {
    const rows = await fetchMapped(certCheck.cfg, ["personal", "expiracion", "marca", "estatus"]);
    resultado.secciones.certificaciones = {
      disponible: true,
      filas: rows.filter((r) => matchesAny(r.personal, variantes)),
    };
  }

  const actCheck = requireTableConfig(relations, "actividades_planificacion", [
    "personal",
    "fecha",
    "nroProyecto",
    "horas",
  ]);
  if (!actCheck.ok) {
    resultado.secciones.actividadesRecientes = { disponible: false, motivo: actCheck.error };
  } else {
    const rows = await fetchMapped(actCheck.cfg, ["personal", "fecha", "nroProyecto", "horas"]);
    resultado.secciones.actividadesRecientes = {
      disponible: true,
      filas: rows.filter((r) => matchesAny(r.personal, variantes)),
    };
  }

  const baseCheck = requireTableConfig(relations, "personal_general", [
    "personal",
    "nombreCompleto",
    "rol",
    "fechaContrato",
  ]);
  if (!baseCheck.ok) {
    resultado.secciones.datosBase = { disponible: false, motivo: baseCheck.error };
  } else {
    const rows = await fetchMapped(baseCheck.cfg, ["personal", "nombreCompleto", "rol", "fechaContrato"]);
    resultado.secciones.datosBase = {
      disponible: true,
      filas: rows.filter((r) => matchesAny(r.personal, variantes) || matchesAny(r.nombreCompleto, variantes)),
    };
  }

  return resultado;
}

// -----------------------------------------------------------------------
// 7-8: horas_por_proyecto / horas_por_personal
// -----------------------------------------------------------------------

async function horasFiltradas({ nroProyecto, nombrePersonal, desde, hasta }) {
  const relations = loadRelations();
  const check = requireTableConfig(relations, "actividades_planificacion", [
    "nroProyecto",
    "personal",
    "fecha",
    "horas",
  ]);
  if (!check.ok) return { disponible: false, motivo: check.error };

  const variantes = nombrePersonal ? expandAliases(nombrePersonal, relations.alias_personal) : null;
  const rows = await fetchMapped(check.cfg, ["nroProyecto", "personal", "fecha", "horas"]);
  const filtradas = rows.filter((r) => {
    if (nroProyecto && !includesCI(r.nroProyecto, nroProyecto)) return false;
    if (variantes && !matchesAny(r.personal, variantes)) return false;
    return inDateRange(r.fecha, desde, hasta);
  });

  const totalHoras = filtradas.reduce((acc, r) => acc + (Number(r.horas) || 0), 0);
  return { disponible: true, totalHoras, registros: filtradas.length, filas: filtradas };
}

export async function horasPorProyecto(nroProyecto, desde, hasta) {
  return { nroProyecto, desde: desde ?? null, hasta: hasta ?? null, ...(await horasFiltradas({ nroProyecto, desde, hasta })) };
}

export async function horasPorPersonal(nombre, desde, hasta) {
  return { nombre, desde: desde ?? null, hasta: hasta ?? null, ...(await horasFiltradas({ nombrePersonal: nombre, desde, hasta })) };
}

// -----------------------------------------------------------------------
// 9-10: tickets_abiertos / tickets_vencidos
// -----------------------------------------------------------------------

const ESTADOS_CERRADOS = [
  "cerrado",
  "cerrada",
  "finalizado",
  "finalizada",
  "resuelto",
  "resuelta",
  "cumplido",
  "cumplida",
];

const MAX_FILAS_TICKETS = 50;

export async function ticketsAbiertos(cliente, limite = MAX_FILAS_TICKETS) {
  const relations = loadRelations();
  const check = requireTableConfig(relations, "tickets_planificacion", [
    "cliente",
    "estatus",
    "fechaCreacion",
    "codigoTicket",
  ]);
  if (!check.ok) return { disponible: false, motivo: check.error };

  const variantes = cliente ? expandAliases(cliente, relations.alias_cliente) : null;
  const rows = await fetchMapped(check.cfg, ["cliente", "estatus", "fechaCreacion", "codigoTicket"]);
  const abiertos = rows.filter((r) => {
    const estatus = (r.estatus ?? "").toLowerCase();
    if (ESTADOS_CERRADOS.some((c) => estatus.includes(c))) return false;
    if (variantes && !matchesAny(r.cliente, variantes)) return false;
    return true;
  });
  return {
    disponible: true,
    total: abiertos.length,
    devueltos: Math.min(abiertos.length, limite),
    filas: abiertos.slice(0, limite),
  };
}

export async function ticketsVencidos(dias = 7, limite = MAX_FILAS_TICKETS) {
  const relations = loadRelations();
  const check = requireTableConfig(relations, "tickets_planificacion", [
    "cliente",
    "estatus",
    "fechaCreacion",
    "codigoTicket",
  ]);
  if (!check.ok) return { disponible: false, motivo: check.error };

  const rows = await fetchMapped(check.cfg, ["cliente", "estatus", "fechaCreacion", "codigoTicket"]);
  const vencidos = rows.filter((r) => {
    const estatus = (r.estatus ?? "").toLowerCase();
    if (ESTADOS_CERRADOS.some((c) => estatus.includes(c))) return false;
    const edad = daysAgo(r.fechaCreacion);
    return edad !== null && edad > dias;
  });
  return {
    disponible: true,
    diasUmbral: dias,
    total: vencidos.length,
    devueltos: Math.min(vencidos.length, limite),
    filas: vencidos.slice(0, limite),
  };
}

// -----------------------------------------------------------------------
// 11: certificaciones_por_vencer
// -----------------------------------------------------------------------

export async function certificacionesPorVencer(dias = 30) {
  const relations = loadRelations();
  const check = requireTableConfig(relations, "capacitaciones_planificacion", [
    "personal",
    "expiracion",
    "marca",
  ]);
  if (!check.ok) return { disponible: false, motivo: check.error };

  const rows = await fetchMapped(check.cfg, ["personal", "expiracion", "marca"]);
  const ahora = Date.now();
  const limite = ahora + dias * 24 * 60 * 60 * 1000;
  const porVencer = rows.filter((r) => {
    if (!r.expiracion) return false;
    const t = new Date(r.expiracion).getTime();
    return !Number.isNaN(t) && t >= ahora && t <= limite;
  });
  return { disponible: true, diasUmbral: dias, total: porVencer.length, filas: porVencer };
}

// -----------------------------------------------------------------------
// 12: proyectos_sin_actualizar (100% funcional: solo depende de projectsTable)
// -----------------------------------------------------------------------

export async function proyectosSinActualizar(dias = 15, estado) {
  const proyectos = await projectsTable.get();
  const target = estado ? estado.toLowerCase() : null;

  const sinActualizar = proyectos.filter((p) => {
    if (esFilaBasura(p)) return false;
    if (target && (p.estado ?? "").toLowerCase() !== target) return false;
    if (!p.fechaRevisado) return true;
    const edad = daysAgo(p.fechaRevisado);
    return edad === null || edad > dias;
  });

  return {
    diasUmbral: dias,
    estadoFiltrado: estado ?? null,
    total: sinActualizar.length,
    proyectos: sinActualizar.map((p) => ({
      codigo: p.codigoProyecto,
      cliente: p.clienteProyecto,
      estado: p.estado,
      liderProyecto: p.liderProyecto,
      fechaRevisado: p.fechaRevisado,
    })),
  };
}

// -----------------------------------------------------------------------
// 13: detectar_codigos_duplicados
// -----------------------------------------------------------------------

export async function detectarCodigosDuplicados() {
  const proyectos = await projectsTable.get();
  const porCodigo = new Map();

  for (const p of proyectos) {
    if (esFilaBasura(p)) continue;
    const codigo = p.codigoProyecto.trim();
    const key = codigo.toLowerCase();
    if (!porCodigo.has(key)) porCodigo.set(key, []);
    porCodigo.get(key).push({
      codigo,
      cliente: p.clienteProyecto,
      estado: p.estado,
      fechaCreacion: p.fechaCreacion,
    });
  }

  const duplicados = [...porCodigo.values()]
    .filter((filas) => filas.length > 1)
    .map((filas) => ({ codigo: filas[0].codigo, ocurrencias: filas.length, filas }));

  return { totalCodigosDuplicados: duplicados.length, duplicados };
}

// -----------------------------------------------------------------------
// 14: extraer_documentos_proyecto
// -----------------------------------------------------------------------

const CAMPOS_ARCHIVO = [
  "archivo1", "archivo2", "archivo3", "archivo4", "archivo5",
  "archivo6", "archivo7", "archivo8", "archivo9", "archivo10",
];
const MAX_CARACTERES_POR_DOCUMENTO = 8000;

async function extraerTextoPdf(url) {
  const parser = new PDFParse({ url });
  try {
    const resultado = await parser.getText();
    return { textoExtraido: resultado.text.slice(0, MAX_CARACTERES_POR_DOCUMENTO), truncado: resultado.text.length > MAX_CARACTERES_POR_DOCUMENTO };
  } finally {
    await parser.destroy();
  }
}

export async function extraerDocumentosProyecto(nroProyecto) {
  const proyectos = await projectsTable.get();
  const proyecto = proyectos.find(
    (p) => (p.codigoProyecto ?? "").toLowerCase() === nroProyecto.toLowerCase()
  );

  if (!proyecto) {
    return { nroProyecto, disponible: false, motivo: `No se encontró un proyecto con codigoProyecto exactamente "${nroProyecto}".` };
  }

  const urls = CAMPOS_ARCHIVO
    .map((campo) => ({ campo, url: proyecto[campo] }))
    .filter(({ url }) => typeof url === "string" && url.trim().length > 0);

  if (urls.length === 0) {
    return { nroProyecto, disponible: true, documentosEncontrados: 0, documentos: [] };
  }

  const documentos = [];
  for (const { campo, url } of urls) {
    try {
      const { textoExtraido, truncado } = await extraerTextoPdf(url);
      documentos.push({ campo, url, disponible: true, textoExtraido, truncado });
    } catch (err) {
      documentos.push({ campo, url, disponible: false, error: String(err?.message ?? err) });
    }
  }

  return { nroProyecto, disponible: true, documentosEncontrados: documentos.length, documentos };
}
