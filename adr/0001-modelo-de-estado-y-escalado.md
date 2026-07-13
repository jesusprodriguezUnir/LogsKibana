# ADR-0001: Modelo de estado de sesión y escalado

- Estado: Propuesto
- Fecha: 2026-07-13

## Contexto

Cada carga de CSV genera un `session_id` y su DataFrame se mantiene en memoria
del proceso y se persiste en disco local (`.session_store/`). Tras la Fase 1 la
persistencia es Parquet (no pickle) y la caché en memoria tiene TTL, límite de
entradas y evicción LRU (ver `services/store.py`).

Este modelo es simple y suficiente para una **única instancia**, pero acopla el
estado al proceso y al disco local:

- Dos réplicas detrás de un balanceador **no comparten sesiones**: una petición
  de búsqueda puede aterrizar en una instancia que no tiene el `session_id`.
- El disco local no es compartido ni duradero en orquestadores (pods efímeros).
- El estado se pierde al reiniciar salvo que el volumen sobreviva.

La pregunta de fondo: ¿necesitamos escalar horizontalmente y/o alta
disponibilidad, o el uso previsto es de baja concurrencia en una sola instancia?

## Decisión

Por ahora se **mantiene el modelo de instancia única** con caché acotada +
Parquet en disco local, por su simplicidad y porque cubre el uso actual
(herramienta interna de análisis puntual). Se documenta explícitamente como una
limitación conocida, no como un descuido.

## Alternativas consideradas

1. **Instancia única (actual).**
   - (+) Cero infraestructura extra, latencia mínima, código simple.
   - (−) No escala horizontalmente; sin HA; estado ligado al proceso.

2. **Estado en Redis** (DataFrame serializado o metadatos + payload).
   - (+) Compartido entre réplicas, TTL nativo, HA gestionable.
   - (−) Dependencia operativa; coste de (de)serialización de DataFrames grandes;
     límites de tamaño de valor.

3. **Almacenamiento de objetos (S3/MinIO) para los Parquet + índice ligero.**
   - (+) Escala a datasets grandes, duradero, desacoplado del proceso.
   - (−) Mayor latencia por consulta; requiere capa de caché; más piezas.

4. **Rediseño stateless con almacenamiento compartido** (subir a objeto, procesar
   por petición/paginación perezosa).
   - (+) Escala y HA reales.
   - (−) Refactor significativo del pipeline de consulta.

## Consecuencias

- Mientras siga en instancia única, **no desplegar más de una réplica** con
  balanceo sin afinidad de sesión (o se romperán las consultas).
- Disparadores para revisar esta decisión: necesidad de HA, de concurrencia
  alta, o de datasets que no quepan cómodamente en memoria por instancia.
- Camino recomendado si se supera el umbral: **opción 2 (Redis)** para el índice
  y metadatos + **opción 3 (objeto)** para los DataFrames en Parquet.

## Referencias

- `MEJORAS.md` §2.1 y §6.
- `backend/src/services/store.py`.
