---
name: run-tests
description: 'Ejecutar la suite de pruebas del proyecto TaskAzureDevops con pytest. Usar para: correr tests, ver resultados, analizar fallos, generar reporte de cobertura, filtrar por módulo o categoría (unit, integration, handlers, widgets, api). Palabras clave: pytest, tests, pruebas, coverage, fallos, errores, test suite.'
argument-hint: 'Opcional: módulo o categoría (ej. "handlers", "azure_api", "--coverage")'
---

# Skill: run-tests

Ejecuta la suite de pruebas del proyecto con `pytest` y presenta los resultados de forma clara.

## Cuándo usar esta skill

- El usuario pide **ejecutar tests**, **correr pruebas**, o ver **resultados de testing**
- Se necesita saber si el código sigue pasando tras un cambio
- El usuario quiere ver **cobertura de código**
- Se quiere filtrar tests por categoría o módulo específico

## Estructura de tests del proyecto

Ver [categorías de tests](./references/test-categories.md) para la guía completa de los 20+ archivos de test y qué cubren.

Fixtures principales (definidos en `tests/conftest.py`):
- `mock_credentials` — credenciales Azure DevOps de prueba
- `mock_pbi_data` — PBI de muestra con todos sus campos
- `mock_task_data` — tarea de muestra
- `mock_iteration_data` — sprint/iteración de muestra
- `mock_team_members` — lista de miembros del equipo

## Procedimiento

### Ejecución básica (todos los tests)

```bash
python .github/skills/run-tests/scripts/run_tests.py
```

O directamente con pytest:

```bash
pytest tests/ -v
```

### Con cobertura

```bash
python .github/skills/run-tests/scripts/run_tests.py --coverage
```

O directamente:

```bash
pytest tests/ -v --cov=core --cov=gui --cov-report=term-missing
```

### Filtrar por módulo o categoría

```bash
# Solo tests de la API de Azure
python .github/skills/run-tests/scripts/run_tests.py --filter azure_api

# Solo tests de handlers de la GUI
python .github/skills/run-tests/scripts/run_tests.py --filter handlers

# Solo tests de integración (marcados con @pytest.mark.integration)
pytest tests/ -v -m integration
```

### Tests manuales (no se ejecutan en CI)

Los archivos `test_*_manual.py` requieren conexión real con Azure DevOps y **no deben** ejecutarse en la suite normal. Para correrlos:

```bash
pytest tests/test_iteration_manual.py -v -s
```

## Interpretación de resultados

| Símbolo | Significado |
|---------|-------------|
| `.` | Test pasó |
| `F` | Test falló (hay que investigar) |
| `E` | Error inesperado en el test |
| `s` | Test saltado (`@pytest.mark.skip`) |
| `x` | Fallo esperado (`@pytest.mark.xfail`) |

## Ciclo tras un fallo

1. Leer el traceback completo del fallo
2. Identificar qué fixture o mock está mal configurado
3. Revisar si el test usa `mock_credentials` y si el módulo fue refactorizado
4. Corregir el código **o** actualizar el test si el comportamiento cambió intencionalmente
5. Re-ejecutar solo el test fallido: `pytest tests/test_X.py::test_funcion -v`
6. Ejecutar la suite completa para confirmar que no hay regresiones

## Configuración del proyecto

```ini
# pytest.ini
[pytest]
markers =
    integration: pruebas de integracion con dependencias externas o contenedores
```

No hay `pytest-cov` en los extras por defecto; se instala con:

```bash
pip install pytest-cov
```
