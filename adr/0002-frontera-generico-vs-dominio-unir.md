# ADR-0002: Frontera herramienta genérica vs. dominio UNIR

- Estado: Propuesto
- Fecha: 2026-07-13

## Contexto

LogsKibana se presenta como una herramienta genérica de análisis de logs de
Kibana, pero el código incorpora reglas específicas del dominio UNIR:

- Inferencias por regex sobre literales propios (`"servicio de "`, `"Unir."`) en
  `services/csv_processor.py`.
- Catálogo de eventos RabbitMQ y sus esquemas de payload (`MatriculaRealizada`,
  `ActaArchivada`, etc.). Tras la Fase 2 esto vive en un registro declarativo
  (`services/event_schemas.py`) y su lista de colas está validada contra las
  definiciones del broker por un test de consistencia.
- El frontend replica parte de ese conocimiento (`config/rabbitFields.ts`,
  nombres de evento en `RabbitExtractor.tsx`).

La cuestión: ¿es un **producto interno UNIR** (y lo asumimos, simplificando), o
una **herramienta genérica** que debe mantener el dominio aislado tras una capa
de configuración/plugins?

## Decisión

Se reconoce que hoy es, de facto, una **herramienta interna UNIR**. Se acepta
ese encuadre a corto plazo, con dos compromisos:

1. **Aislar el dominio en puntos de extensión declarativos**, no incrustado en el
   pipeline. La Fase 2 ya movió los esquemas de evento a `event_schemas.py`; las
   inferencias `infer_*` deberían seguir el mismo patrón (tabla de reglas
   configurable) en lugar de literales dispersos.
2. **Una única fuente de verdad por evento**, compartida conceptualmente entre
   backend y frontend, para evitar la deriva (ver `MEJORAS.md` §4).

No se invierte ahora en convertirlo en un producto genérico multi-cliente
mientras no exista esa necesidad.

## Alternativas consideradas

1. **Asumir producto interno UNIR (decisión adoptada).**
   - (+) Simplifica: no hay que abstraer lo que solo tiene un consumidor.
   - (−) Menor reutilización fuera de UNIR.

2. **Producto genérico con dominio como plugin/config externa.**
   - (+) Reutilizable; núcleo limpio.
   - (−) Sobre-ingeniería si nunca hay un segundo cliente; coste de diseño de la
     capa de extensión.

3. **Statu quo (dominio incrustado en el pipeline).**
   - (−) Acoplamiento y duplicación; tocar el núcleo por cada evento nuevo.
     Descartado: es la deuda que las Fases 1–2 empezaron a pagar.

## Consecuencias

- Nuevos eventos se añaden como datos en `event_schemas.py` (y su equivalente de
  frontend), no tocando el pipeline.
- Las inferencias `infer_*` quedan señaladas como próximo candidato a
  externalizar en una tabla de reglas.
- Si en el futuro aparece un segundo cliente/dominio, reevaluar hacia la
  alternativa 2.

## Referencias

- `MEJORAS.md` §2.6, §3.2, §4, §6.
- `backend/src/services/event_schemas.py`, `services/csv_processor.py`.
