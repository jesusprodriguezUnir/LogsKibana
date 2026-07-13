import { useState } from "react";
import { LevelBadge } from "./components/LevelBadge";
import { MessageCell } from "./components/MessageCell";
import { UploadDropzone } from "./components/UploadDropzone";
import { GroupPanel, SummaryMiniPanel } from "./components/GroupPanels";
import { MessageModal } from "./components/MessageModal";
import { useLogQuery } from "./hooks/useLogQuery";

const SORT_FIELDS = ["timestamp", "level", "service", "host", "logger", "location", "method", "status_code"];
const DEFAULT_GROUP_FIELDS = ["level", "service", "logger", "location"];

// ─── Main component ────────────────────────────────────────────────────────────

export function LogExplorer() {
  const q = useLogQuery();
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  const {
    sessionId, rowCount, loading, error, filters, rows, total, groups,
    page, pageSize, sortBy, sortOrder, groupFields, canQuery, totalPages,
    setPageSize, setSortBy, setSortOrder,
    setFilter, clearFilters, toggleGroupField,
    runQuery, handleUpload, handleSearch, handleSort, exportCsv,
  } = q;

  const availableGroupFields = groups?.available_group_fields ?? DEFAULT_GROUP_FIELDS;
  const topLoggers    = Object.entries(groups?.groups.logger      ?? {}).slice(0, 5);
  const topLocations  = Object.entries(groups?.groups.location    ?? {}).slice(0, 5);
  const topStatuses   = Object.entries(groups?.groups.status_code ?? {}).slice(0, 5);

  return (
    <div className="page">
      {/* ── Upload ───────────────────────────────────────── */}
      <section className="card" aria-label="Cargar CSV">
        <p className="card__title"><span className="card__title-icon">📥</span>Cargar CSV de Kibana</p>
        <UploadDropzone
          onFile={(f) => void handleUpload(f)}
          loading={loading && !sessionId}
          sessionId={sessionId || undefined}
          rowCount={rowCount}
        />
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      {groups && (
        <div className="stats-row" aria-label="Estadísticas">
          <div className="stat-card">
            <div className="stat-card__label">Total filas</div>
            <div className="stat-card__value accent">{groups.total_rows.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Errores</div>
            <div className="stat-card__value" style={{ color: "var(--error)" }}>
              {(groups.groups.level?.error ?? 0) + (groups.groups.level?.fatal ?? 0) + (groups.groups.level?.exception ?? 0)}
            </div>
          </div>
          <SummaryMiniPanel title="Top logger"    entries={topLoggers} />
          <SummaryMiniPanel title="Top location"  entries={topLocations} />
          <SummaryMiniPanel title="Top status"    entries={topStatuses} />
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────── */}
      <section className="card" aria-label="Filtros">
        <p className="card__title"><span className="card__title-icon">🔍</span>Filtros y búsqueda</p>
        <div className="filter-grid">
          <div className="field-group">
            <label htmlFor="f-text">Texto libre</label>
            <input id="f-text" type="search" placeholder="Buscar en message…" value={filters.searchText} onChange={(e) => setFilter("searchText", e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="f-level">Nivel</label>
            <select id="f-level" value={filters.level} onChange={(e) => setFilter("level", e.target.value)}>
              <option value="">— todos —</option>
              {["fatal","error","exception","warning","info","debug","unknown"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="f-service">Service</label>
            <input id="f-service" type="text" placeholder="ej. evaluaciones" value={filters.service} onChange={(e) => setFilter("service", e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="f-host">Host</label>
            <input id="f-host" type="text" placeholder="ej. host-1" value={filters.host} onChange={(e) => setFilter("host", e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="f-logger">Logger exacto</label>
            <select id="f-logger" value={filters.logger} onChange={(e) => setFilter("logger", e.target.value)}>
              <option value="">— todos —</option>
              {(groups?.filter_options.logger ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="f-location">Location exacta</label>
            <select id="f-location" value={filters.location} onChange={(e) => setFilter("location", e.target.value)}>
              <option value="">— todas —</option>
              {(groups?.filter_options.location ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="f-status">Status code</label>
            <select id="f-status" value={filters.statusCode} onChange={(e) => setFilter("statusCode", e.target.value)}>
              <option value="">— todos —</option>
              {(groups?.filter_options.status_code ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="f-mtext">Buscar en message</label>
            <input id="f-mtext" type="text" placeholder="texto parcial…" value={filters.messageText} onChange={(e) => setFilter("messageText", e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="f-ltext">Buscar en logger</label>
            <input id="f-ltext" type="text" placeholder="texto parcial…" value={filters.loggerText} onChange={(e) => setFilter("loggerText", e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="f-loctext">Buscar en location</label>
            <input id="f-loctext" type="text" placeholder="texto parcial…" value={filters.locationText} onChange={(e) => setFilter("locationText", e.target.value)} />
          </div>
        </div>
        <div className="action-bar">
          <button className="btn btn-primary" disabled={!canQuery || loading} onClick={handleSearch}>
            {loading ? <><span className="spinner" />Buscando…</> : "🔍 Buscar"}
          </button>
          <button className="btn btn-secondary" disabled={!canQuery || loading} onClick={exportCsv}>
            ⬇ Exportar CSV
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!canQuery} onClick={clearFilters}>
            Limpiar filtros
          </button>
        </div>
      </section>

      {/* ── Error alert ──────────────────────────────────── */}
      {error && (
        <div className="alert alert-error" role="alert">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Group fields ─────────────────────────────────── */}
      {groups && (
        <section className="card" aria-label="Agrupaciones">
          <p className="card__title"><span className="card__title-icon">📊</span>Campos de agrupación</p>
          <div className="chip-grid">
            {availableGroupFields.map((field) => (
              <label
                key={field}
                className={`chip-toggle${groupFields.includes(field) ? " checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={groupFields.includes(field)}
                  onChange={() => toggleGroupField(field)}
                />
                {field}
              </label>
            ))}
          </div>
          <div className="action-bar">
            <button
              className="btn btn-secondary btn-sm"
              disabled={!canQuery || loading}
              onClick={() => void runQuery(sessionId, groupFields)}
            >
              Reagrupar
            </button>
          </div>
        </section>
      )}

      {/* ── Diagnostics ──────────────────────────────────── */}
      {groups && groups.diagnostics.length > 0 && (
        <section className="card" aria-label="Panel diagnóstico">
          <p className="card__title"><span className="card__title-icon">🩺</span>Panel diagnóstico (top errores)</p>
          <div className="table-wrap">
            <table className="diag-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Status Code</th>
                  <th>Logger</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {groups.diagnostics.map((item, i) => (
                  <tr key={`diag-${i}`}>
                    <td>{item.service}</td>
                    <td><span className="level-badge warning">{item.status_code}</span></td>
                    <td title={item.logger}>{item.logger}</td>
                    <td>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Results table ─────────────────────────────────── */}
      <section className="card" aria-label={`Resultados (${total})`}>
        <p className="card__title">
          <span className="card__title-icon">📋</span>
          Resultados
          {total > 0 && <span style={{ color: "var(--teal)", fontWeight: 700 }}>{total.toLocaleString()}</span>}
        </p>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="field-group">
            <label>Ordenar por</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Orden</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">↓ desc</option>
              <option value="asc">↑ asc</option>
            </select>
          </div>
          <div className="field-group">
            <label>Filas / página</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[25, 50, 100, 200].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: "flex-end" }}
            disabled={!canQuery || loading}
            onClick={() => void runQuery(sessionId, groupFields, 1, pageSize, sortBy, sortOrder, filters)}
          >
            Aplicar
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["timestamp","level","service","host","logger","location","method","status_code","message"].map((col) => (
                  <th
                    key={col}
                    className={sortBy === col ? "sorted" : ""}
                    onClick={() => handleSort(col)}
                    title={`Ordenar por ${col}`}
                  >
                    {col} {sortBy === col ? (sortOrder === "desc" ? "↓" : "↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.timestamp}-${idx}`}>
                  <td title={row.timestamp}>{row.timestamp}</td>
                  <td><LevelBadge level={row.level} /></td>
                  <td title={row.service}>{row.service}</td>
                  <td title={row.host}>{row.host}</td>
                  <td title={row.logger}>{row.logger}</td>
                  <td title={row.location}>{row.location}</td>
                  <td><span className="level-badge info">{row.method}</span></td>
                  <td title={row.status_code}>{row.status_code}</td>
                  <td><MessageCell text={row.message} onOpenDetail={setSelectedMessage} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={9}>
                    {canQuery ? "Sin resultados para los filtros seleccionados" : "Carga un CSV para comenzar"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <span className="pagination__info">
            {total > 0 ? `Mostrando ${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} de ${total.toLocaleString()}` : ""}
          </span>
          <div className="pagination__controls">
            <button className="btn btn-ghost btn-sm" disabled={!canQuery || loading || page <= 1}
              onClick={() => void runQuery(sessionId, groupFields, page - 1, pageSize, sortBy, sortOrder, filters)}>
              ‹ Anterior
            </button>
            <span className="pagination__current">Pág. {page} / {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={!canQuery || loading || page >= totalPages}
              onClick={() => void runQuery(sessionId, groupFields, page + 1, pageSize, sortBy, sortOrder, filters)}>
              Siguiente ›
            </button>
          </div>
        </div>
      </section>

      {/* ── Group panels ──────────────────────────────────── */}
      {groups && (
        <section className="card" aria-label="Agrupaciones detalladas">
          <p className="card__title"><span className="card__title-icon">🗂</span>Agrupaciones</p>
          <div className="groups-grid">
            {Object.entries(groups.groups).map(([field, values]) => (
              <GroupPanel key={field} field={field} values={values} />
            ))}
          </div>
        </section>
      )}

      {selectedMessage && (
        <MessageModal message={selectedMessage} onClose={() => setSelectedMessage(null)} />
      )}
    </div>
  );
}

// ─── Export default for router compatibility ───────────────────────────────────
export default LogExplorer;
