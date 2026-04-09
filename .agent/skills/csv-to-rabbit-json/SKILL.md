---
name: csv-to-rabbit-json
description: Extrae mensajes RabbitMQ de un archivo CSV proporcionado por el usuario y los guarda como archivos JSON individuales o un único archivo de salida. Úsalo cuando necesites convertir lotes de mensajes RabbitMQ desde CSV a formato JSON para pruebas, migraciones o análisis.
license: Apache-2.0
---

# Conversión de mensajes RabbitMQ desde CSV a JSON

## Descripción

Esta skill automatiza la extracción de mensajes RabbitMQ desde un archivo CSV y los convierte en archivos JSON. Es útil para preparar datos de prueba, migrar mensajes o analizar lotes de mensajes RabbitMQ exportados en CSV.

## Uso rápido

1. Proporciona el archivo CSV con los mensajes RabbitMQ.
2. Ejecuta la skill para extraer cada mensaje y guardarlo como archivo JSON (uno por mensaje o todos en un solo archivo, según configuración).

## Proceso paso a paso

1. Leer el archivo CSV proporcionado.
2. Identificar las columnas relevantes para el mensaje RabbitMQ (por ejemplo: routing_key, body, headers, etc.).
3. Para cada fila, construir un objeto JSON representando el mensaje RabbitMQ.
4. Guardar cada mensaje como archivo JSON individual o agregar todos a un archivo de salida.

## Parámetros configurables

- Ruta del archivo CSV de entrada.
- Carpeta de salida para los archivos JSON.
- Opción para salida en archivos individuales o un solo archivo JSON.
- Mapeo de columnas CSV a campos del mensaje RabbitMQ.

## Ejemplo de prompt

- "Convierte este archivo CSV de mensajes RabbitMQ a archivos JSON."
- "Extrae los mensajes RabbitMQ del CSV y guárdalos en un solo archivo JSON."

## Referencias

- [RabbitMQ Message Format](https://www.rabbitmq.com/tutorials/amqp-concepts.html)
- [Python csv.DictReader](https://docs.python.org/3/library/csv.html)
- [json module](https://docs.python.org/3/library/json.html)

## Validación

- Verifica que todos los mensajes del CSV se convierten correctamente a JSON.
- Comprueba que los archivos de salida contienen los campos esperados.

## Iteración

Ajusta el mapeo de columnas o el formato de salida según los requisitos del proyecto o feedback de uso.
