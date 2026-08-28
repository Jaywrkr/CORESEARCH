# Mapa de relaciones — glide-core-mcp

Documentación de referencia para `relations.json`. Generado el 2026-08-26
inspeccionando schema (`inspeccionar_tabla`) y datos reales (`obtener_filas`)
de las tablas de la app Glide de Coresolutions. Glide no expone relaciones
via API, así que este mapa es manual y debe actualizarse si cambian los
nombres de columna en Glide.

## Claves principales que atan las tablas

| Clave | Formato | Tablas donde aparece |
|---|---|---|
| **Nro Proyecto / Codigo Proyecto** | `CS-###`, `POA ####`, `PPR-####` | Actividades, Cronograma, Equipos Proyecto, Proyectos Gestion (`column1`), Proyectos Planificacion |
| **Cliente** | texto libre, sin formato fijo | Proyectos Gestion (`column2`), Tickets (`Clente`, con typo), Clientes Personal, CLIENTES GENERAL, Hardware, Software, Órdenes de Compra |
| **Personal** | nombre corto (`Andres C`) en la mayoría de tablas | Actividades, Cronograma, PERSONAL GENERAL — **excepción:** Capacitaciones usa nombre completo |

## Cosas a tener en cuenta

- **Tickets Planificacion se vincula principalmente por Cliente, no por Nro Proyecto.** Muchos tickets no tienen proyecto asociado — no asumir que siempre hay join posible.
- **Formato de Personal inconsistente:** Actividades/Cronograma/PERSONAL GENERAL usan nombre corto (`Luis Miguel S`); Capacitaciones usa nombre completo (`Luis Miguel Serrano`). Se resuelve con el diccionario `alias_personal` en `relations.json`, sin tocar los datos en Glide.
- **Formato de Cliente inconsistente:** puede haber variantes/alias entre lo que se escribe en Proyectos/Tickets y el nombre maestro en CLIENTES GENERAL (ej. `SUKASA` vs `COMOHOGAR (SUKASA)`). Se resuelve con `alias_cliente`, que por ahora solo tiene los casos detectados — hay que ampliarlo según se encuentren más.
- **Proyectos Gestion tiene columnas genéricas** (`column1`, `column2`...) sin nombres reales en el schema. Confirmado con datos reales:
  - `column1` = Código de proyecto
  - `column2` = Cliente
  - `column4` = Nro Contrato
  - `column6`/`column7` = fechas (adjudicación / anticipo)
  - `column8` = plazo en días
  - `column12` = monto del contrato
  - `column13` = estado de facturación
- **x - Clientes Planificacion** y **x - Personal Planificacion** son tablas FÍSICAMENTE DISTINTAS de CLIENTES GENERAL y PERSONAL GENERAL (confirmado con `listar_tablas`: mismo id base pero sin el sufijo " A" que sí tienen las generales). No es un error de copiado. Falta confirmar cuál de las dos es la autoritativa antes de usarlas como fuente alternativa.
- **CLIENTES GENERAL** trae contadores YA PRECALCULADOS por Glide por cliente: `Nro Proyectos`, `Nro Oportunidades`, `Contador Oportunidad Ganada/Perdida/Detectada`, `Nro Proyectos En Curso/Terminados` — no hace falta recalcularlos cruzando otras tablas.
- **Compras Publicas Planificacion** NO se vincula por Nro Proyecto (ese supuesto era erróneo) — es un tracker de licitaciones/oportunidades públicas por CLIENTE, con estado tipo `"2 - GANADO"` / `"4 - PERDIDO"` / `"5 - DESIERTO"` / `"1 - TRABAJANDO"`.

## Por confirmar (no verificado con datos reales todavía)

- `HorasSoporte Gestion` y `Servicios Gestion` — ya mapeadas en `relations.json` con datos reales (2026-08-27); falta confirmar el significado exacto de un par de campos genéricos (`campo9`/`flag10` en HorasSoporte, `categoria` en Servicios).

## Cómo usar esto en el servidor

`relations.json` es la fuente de verdad que debe leer cualquier tool nuevo
que necesite cruzar tablas (ej. `obtener_proyecto_completo`,
`obtener_cliente_resumen`). Antes de hacer un join, resolver el nombre de
Personal o Cliente contra `alias_personal` / `alias_cliente` para evitar
que un mismatch de formato (nombre corto vs. completo, alias de cliente)
haga que la búsqueda no encuentre resultados que sí existen.

Si en el futuro se detectan más variantes de nombre (personal o cliente)
que no están en los diccionarios, agregarlas ahí — no hardcodear la
normalización dentro de cada tool individual.
