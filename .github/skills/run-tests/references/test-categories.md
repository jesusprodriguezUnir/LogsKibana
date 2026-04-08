# Categorías de tests — TaskAzureDevops

Referencia rápida de los 20+ archivos de test del proyecto. Útil para saber qué archivo tocar cuando algo falla o cuando hay que añadir un test.

## Categorías

| Categoría | Descripción | Ejecuta en CI |
|-----------|-------------|:-------------:|
| **unit** | Pruebas aisladas de una función o clase | ✅ |
| **integration** | Flujos completos entre módulos (sin red) | ✅ |
| **feature** | Características específicas end-to-end | ✅ |
| **manual** | Requieren conexión real a Azure DevOps | ❌ |

---

## Tests por archivo

### `core/` — Lógica de negocio y API

| Archivo | Categoría | Módulo cubierto | Qué verifica |
|---------|-----------|-----------------|--------------|
| `test_azure_api.py` | unit | `core/azure_api.py` | Credenciales, headers, llamadas REST, iteraciones |
| `test_pbi_utils.py` | unit | `core/pbi_utils.py` | Utilidades de PBIs: parsing, filtrado |
| `test_workitem_iteration.py` | unit | `core/workitem_iteration.py` | Lógica de iteraciones en work items |
| `test_workitem_iteration_helpers.py` | unit | `core/workitem_iteration_helpers.py` | Funciones auxiliares de iteración |
| `test_workitem_iteration_query.py` | unit | `core/workitem_iteration_query.py` | Queries WIQL de iteraciones |

### `gui/` — Interfaz de usuario (Tkinter)

| Archivo | Categoría | Módulo cubierto | Qué verifica |
|---------|-----------|-----------------|--------------|
| `test_widgets.py` | unit | `gui/widgets.py` | Creación de componentes UI, validación de formularios |
| `test_handlers.py` | unit | `gui/handlers.py` | Manejadores de eventos, actualizaciones de UI |
| `test_widgets_enhancements.py` | feature | `gui/widgets.py` | Mejoras y funcionalidades extendidas de widgets |
| `test_handlers_enhancements.py` | feature | `gui/handlers.py` | Mejoras en handlers, flujos complejos |
| `test_html_cleanup.py` | unit | `gui/text_utils.py` | Limpieza de HTML en campos de texto |

### Flujos de aplicación

| Archivo | Categoría | Módulo cubierto | Qué verifica |
|---------|-----------|-----------------|--------------|
| `test_main.py` | unit | `main.py` | Carga de miembros de equipo, descripciones de tareas |
| `test_integration.py` | integration | `core/` + `gui/` | Flujos end-to-end, manejo de errores |
| `test_bulk_update.py` | feature | `core/` | Actualizaciones masivas de work items |
| `test_pbis_bulk.py` | feature | `core/` | Creación masiva de PBIs |

### Capacidad y sprints

| Archivo | Categoría | Módulo cubierto | Qué verifica |
|---------|-----------|-----------------|--------------|
| `test_capacity_grid.py` | feature | `core/capacity.py` | Grid de capacidad del equipo |
| `test_sprint_grid_enhancements.py` | feature | `gui/` | Mejoras del grid de sprint |
| `test_burndown_feature.py` | feature | `core/` | Funcionalidad de burndown |

### Evidencias

| Archivo | Categoría | Módulo cubierto | Qué verifica |
|---------|-----------|-----------------|--------------|
| `test_evidence_store.py` | unit | `core/evidence_store.py` | Almacén de evidencias técnicas |
| `test_evidence_store_integration.py` | integration | `core/evidence_store.py` | Flujo completo de evidencias |
| `test_evidence_export.py` | feature | `core/evidence_store.py` | Exportación de evidencias |

### Tests manuales (⚠️ requieren Azure DevOps real)

| Archivo | Descripción |
|---------|-------------|
| `test_burndown_manual.py` | Burndown con datos reales del sprint |
| `test_capacity_manual.py` | Capacidad real del equipo |
| `test_features_manual.py` | Feature flags con API real |
| `test_iteration_manual.py` | Iteraciones reales del proyecto |
| `test_raw_capacity_manual.py` | Capacidad raw de Azure DevOps |
| `test_team_days_api_manual.py` | Días del equipo vía API |
| `test_team_days_manual.py` | Días del equipo (manual) |

Para ejecutarlos: `pytest tests/test_<nombre>_manual.py -v -s`

---

## Fixtures de `conftest.py`

| Fixture | Tipo | Descripción |
|---------|------|-------------|
| `mock_credentials` | dict | PAT + org + project + team para pruebas |
| `mock_pbi_data` | dict | PBI completo con todos los campos de Azure DevOps |
| `mock_task_data` | dict | Tarea con campos `System.*` |
| `mock_iteration_data` | dict | Sprint/iteración con fechas |
| `mock_team_members` | list | Lista de miembros del equipo con name/email/role/azure_id |

---

## Comandos de referencia rápida

```bash
# Suite completa (excluye manuales)
pytest tests/ -v --ignore-glob="*_manual.py"

# Solo un módulo
pytest tests/test_azure_api.py -v

# Solo tests de integración
pytest tests/ -v -m integration

# Un test concreto
pytest tests/test_handlers.py::TestTaskHandlers::test_load_pbi -v

# Con cobertura
pytest tests/ -v --cov=core --cov=gui --cov-report=term-missing
```
