import { useMemo, useState, type ChangeEvent } from "react";
import { buildApiUrl, requestJson } from "../services/api";
import type { LogRow, SearchResponse } from "../types";
import { LevelBadge } from "./LevelBadge";
import { MessageCell } from "./MessageCell";
import { UploadDropzone } from "./UploadDropzone";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RabbitRow extends LogRow {
  rabbitName: string;
  rabbitPayload: Record<string, unknown>;
  parseError: string | null;
  logError: string | null;
  errorType: "Exception" | "StatusCode" | "Parseo" | "Sin detalle";
}

interface PayloadFilters {
  IdActa: string;
  Fecha_from: string;
  Fecha_to: string;
  IdClase: string;
  TipoEvaluacion: string;
  IdAlumnoIntegracion: string;
  OrigenActa: string;
}

const EMPTY_PAYLOAD_FILTERS: PayloadFilters = {
  IdActa: "", Fecha_from: "", Fecha_to: "",
  IdClase: "", TipoEvaluacion: "", IdAlumnoIntegracion: "", OrigenActa: "",
};

const RABBIT_NAMES = [
  "MatriculaRealizada", "MatriculaAnulada", "MatriculaRecuperada",
  "MatriculaDesestimada", "MatriculaReiniciada", "MatriculaAmpliacionReiniciada",
  "MatriculaAmpliacionAnulada", "MatriculaAmpliacionDesestimada",
  "MatriculaAmpliacionRecuperada", "MatriculaAmpliacionRealizada",
  "MatriculaVariacionAnulada", "MatriculaVariacionRealizada",
  "MatriculaVariacionRecuperada", "ClienteModificado", "DefensaModificada",
  "ActaArchivada", "CuentaBloqueada", "CuentaDesbloqueada",
  "MatriculaPeriodoAcademicoCambiado", "DocumentoFirmado",
  "MatriculaVariacionReiniciada", "MatriculaVariacionDesestimada",
  "NotaFinalGenerada", "NotaDesglosadaModificada", "ExpedientesMigrados",
  "ProgresoEstudianteActualizado", "DiligenciaResuelta", "ConvocatoriasTFECerradas",
  "DiligenciaCerrada", "ActaCancelada", "FechaPagoTituloSolicitado",
] as const;

const LIMPIOS = new Set<string>(["NotaFinalGenerada", "NotaDesglosadaModificada", "ActaArchivada"]);
const SEARCH_PAGE_SIZE = 500;

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function extractRabbitName(message: string): string | null {
  return RABBIT_NAMES.find((n) => message.includes(n)) ?? null;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const p = JSON.parse(value);
    return typeof p === "object" && p !== null ? (p as Record<string, unknown>) : null;
  } catch { return null; }
}

function extractBalancedJson(input: string): string | null {
  let depth = 0, start = -1;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (input[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) return input.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function extraerJsonLimpio(texto: string, rabbitName: string): Record<string, unknown> | null {
  if (rabbitName === "ActaArchivada") {
    const m = /\"Message\"\s*:\s*\"([^\"]+)\"/.exec(texto);
    if (m) {
      const decoded = m[1]
        .replace(/\/u0022/g, '"').replace(/\/u002c/g, ",")
        .replace(/\/u002f/g, "/").replace(/\/u003a/g, ":");
      const p = tryParseJson(decoded);
      if (p) return p;
    }
  }
  const rm = /Request:\s*(\{.*\})/s.exec(texto);
  const candidate = rm ? rm[1] : texto.slice(Math.max(0, texto.indexOf("{")));
  if (!candidate?.includes("{")) return null;
  const block = extractBalancedJson(candidate);
  return block ? tryParseJson(block) : null;
}

function buildRabbitPayload(row: LogRow, rabbitName: string): { rabbitPayload: Record<string, unknown>; parseError: string | null } {
  if (LIMPIOS.has(rabbitName)) {
    const limpio = extraerJsonLimpio(row.message, rabbitName);
    if (limpio) return { rabbitPayload: limpio, parseError: null };
    return {
      rabbitPayload: { rabbit_name: rabbitName, timestamp: row.timestamp, message: row.message },
      parseError: "No se pudo extraer JSON limpio",
    };
  }
  return {
    rabbitPayload: { rabbit_name: rabbitName, timestamp: row.timestamp, message: row.message },
    parseError: null,
  };
}

function extractLogError(message: string): string | null {
  const em = /Exception caught:\s*(.*?)(?:\s*\.\s*RabbitMQ message End on:|\s*RabbitMQ message End on:|$)/s.exec(message);
  if (em?.[1]) return em[1].trim();
  const sm = /StatusCode:\s*([^,\s]+)/i.exec(message);
  if (sm?.[1] && sm[1].toLowerCase() !== "ok") return `StatusCode: ${sm[1]}`;
  return null;
}

function classifyErrorType(logError: string | null, parseError: string | null): RabbitRow["errorType"] {
  if (logError?.startsWith("StatusCode:")) return "StatusCode";
  if (logError) return "Exception";
  if (parseError) return "Parseo";
  return "Sin detalle";
}

function errorTypeCssClass(t: string) {
  return t.toLowerCase().replace(" ", "");
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchAllRows(sessionId: string, extraParams?: URLSearchParams): Promise<LogRow[]> {
  const base = new URLSearchParams({
    session_id: sessionId,
    page: "1",
    page_size: String(SEARCH_PAGE_SIZE),
    sort_by: "timestamp",
    sort_order: "desc",
  });
  if (extraParams) extraParams.forEach((v, k) => base.set(k, v));

  const first = await requestJson<SearchResponse>(`/search?${base}`);
  const collected = [...(first.items ?? [])];
  const total = first.total ?? collected.length;
  const ps = first.page_size ?? SEARCH_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / ps));

  for (let p = 2; p <= totalPages; p++) {
    base.set("page", String(p));
    const next = await requestJson<SearchResponse>(`/search?${base}`);
    if (next.items?.length) collected.push(...next.items);
  }
  return collected;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RabbitExtractor() {
  const [rows,                setRows]                = useState<LogRow[]>([]);
  const [sessionId,           setSessionId]           = useState("");
  const [rowCount,            setRowCount]            = useState<number | undefined>(undefined);
  const [loading,             setLoading]             = useState(false);
  const [error,               setError]               = useState<string | null>(null);
  const [copied,              setCopied]              = useState(false);
  const [statusMessage,       setStatusMessage]       = useState("");
  const [selectedRabbitNames, setSelectedRabbitNames] = useState<string[]>([...RABBIT_NAMES]);
  const [modalRow,            setModalRow]            = useState<RabbitRow | null>(null);
  const [payloadFilters,      setPayloadFilters]      = useState<PayloadFilters>(EMPTY_PAYLOAD_FILTERS);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const rabbitRows = useMemo<RabbitRow[]>(() =>
    rows.flatMap((row) => {
      const rabbitName = extractRabbitName(row.message);
      if (!rabbitName) return [];
      const { rabbitPayload, parseError } = buildRabbitPayload(row, rabbitName);
      const logError = extractLogError(row.message);
      const errorType = classifyErrorType(logError, parseError);
      return [{ ...row, rabbitName, rabbitPayload, parseError, logError, errorType }];
    }),
  [rows]);

  const detectedRabbitNames = useMemo(() =>
    Array.from(new Set(rabbitRows.map((r) => r.rabbitName))),
  [rabbitRows]);

  const filteredRows = useMemo(() => {
    if (selectedRabbitNames.length === 0) return [];
    const sel = new Set(selectedRabbitNames);
    return rabbitRows.filter((r) => sel.has(r.rabbitName));
  }, [rabbitRows, selectedRabbitNames]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setRows([]);
    setSessionId("");
    setCopied(false);
    try {
      const form = new FormData();
      form.append("file", file);
      setStatusMessage("Paso 1/2: subiendo CSV…");
      const uploadData = await requestJson<{ session_id?: string; rows?: number }>("/upload", { method: "POST", body: form });
      if (!uploadData.session_id) throw new Error("El backend no devolvió un session_id válido.");
      setSessionId(uploadData.session_id);
      setRowCount(uploadData.rows);

      setStatusMessage("Paso 2/2: extrayendo mensajes…");
      const collected = await fetchAllRows(uploadData.session_id);
      setRows(collected);
      setStatusMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  const applyPayloadFilters = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const extra = new URLSearchParams();
      if (payloadFilters.IdActa)             extra.set("payload.IdActa",             payloadFilters.IdActa);
      if (payloadFilters.Fecha_from)         extra.set("payload.Fecha_from",         payloadFilters.Fecha_from);
      if (payloadFilters.Fecha_to)           extra.set("payload.Fecha_to",           payloadFilters.Fecha_to);
      if (payloadFilters.IdClase)            extra.set("payload.IdClase",            payloadFilters.IdClase);
      if (payloadFilters.TipoEvaluacion)     extra.set("payload.TipoEvaluacion",     payloadFilters.TipoEvaluacion);
      if (payloadFilters.IdAlumnoIntegracion)extra.set("payload.IdAlumnoIntegracion",payloadFilters.IdAlumnoIntegracion);
      if (payloadFilters.OrigenActa)         extra.set("payload.OrigenActa",         payloadFilters.OrigenActa);
      const collected = await fetchAllRows(sessionId, extra);
      setRows(collected);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error aplicando filtros");
    } finally {
      setLoading(false);
    }
  };

  const setPF = (key: keyof PayloadFilters, value: string) =>
    setPayloadFilters((f) => ({ ...f, [key]: value }));

  const downloadFilteredJson = () => {
    if (filteredRows.length === 0) return;
    const payload = filteredRows.map((r) => ({
      rabbit_name: r.rabbitName, timestamp: r.timestamp,
      payload: r.rabbitPayload, error_type: r.errorType,
      log_error: r.logError, parse_error: r.parseError,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url, download: `rabbit_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZipFromServer = async () => {
    if (!sessionId || filteredRows.length === 0) return;
    try {
      const params = new URLSearchParams({ session_id: sessionId });
      if (selectedRabbitNames.length > 0) params.set("message_text", selectedRabbitNames.join("|"));
      const resp = await fetch(buildApiUrl(`/export_zip?${params}`));
      if (!resp.ok) throw new Error(`Error en export ZIP: ${resp.statusText}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url, download: `rabbit_messages_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  const downloadSingleMessage = (row: RabbitRow) => {
    const meta = {
      timestamp: row.timestamp, service: row.service,
      logger: row.logger, location: row.location,
      error_type: row.errorType, log_error: row.logError, parse_error: row.parseError,
    };
    const content = `METADATA:\n${JSON.stringify(meta, null, 2)}\n\nMESSAGE:\n${JSON.stringify(row.rabbitPayload, null, 2)}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url, download: `message_${row.rabbitName}_${row.timestamp.replace(/[:.]/g, "-")}.txt`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Upload */}
      <section className="card">
        <p className="card__title"><span className="card__title-icon">🐇</span>Extractor de mensajes RabbitMQ</p>
        <UploadDropzone
          onFile={(f) => void handleUpload(f)}
          loading={loading && !sessionId}
          sessionId={sessionId || undefined}
          rowCount={rowCount}
        />
        {statusMessage && (
          <div className="status-msg">
            <span className="spinner" />
            {statusMessage}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
      </section>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card__label">Filas totales</div>
            <div className="stat-card__value">{rows.length.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Con Rabbit</div>
            <div className="stat-card__value teal">{rabbitRows.length.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Filtrados</div>
            <div className="stat-card__value accent">{filteredRows.length.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Tipos detectados</div>
            <div className="stat-card__value">{detectedRabbitNames.length}</div>
          </div>
        </div>
      )}

      {/* Name filter */}
      {rows.length > 0 && (
        <section className="card">
          <div className="rabbit-header">
            <p className="card__title" style={{ margin: 0 }}>
              <span className="card__title-icon">🏷</span>Tipos Rabbit detectados
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={detectedRabbitNames.length === 0}
                onClick={() => setSelectedRabbitNames(detectedRabbitNames)}>
                Seleccionar todos
              </button>
              <button className="btn btn-ghost btn-sm" disabled={selectedRabbitNames.length === 0}
                onClick={() => setSelectedRabbitNames([])}>
                Limpiar
              </button>
            </div>
          </div>

          {detectedRabbitNames.length > 0 && (
            <div className="rabbit-names-grid">
              {detectedRabbitNames.map((name) => (
                <label key={name} className="rabbit-name-item">
                  <input
                    type="checkbox"
                    checked={selectedRabbitNames.includes(name)}
                    onChange={() =>
                      setSelectedRabbitNames((cur) =>
                        cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]
                      )
                    }
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          )}

          {/* ActaArchivada payload filters */}
          {detectedRabbitNames.includes("ActaArchivada") && (
            <div className="payload-filters">
              <div className="payload-filters__title">
                <span>📋</span> Filtros ActaArchivada
              </div>
              <div className="payload-filters-grid">
                {(["IdActa", "IdClase", "TipoEvaluacion", "IdAlumnoIntegracion", "OrigenActa"] as Array<keyof PayloadFilters>).map((key) => (
                  <div className="field-group" key={key}>
                    <label htmlFor={`pf-${key}`}>{key}</label>
                    <input
                      id={`pf-${key}`}
                      type="text"
                      value={payloadFilters[key]}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPF(key, e.target.value)}
                    />
                  </div>
                ))}
                <div className="field-group">
                  <label htmlFor="pf-fecha-from">Fecha desde</label>
                  <input id="pf-fecha-from" type="date" value={payloadFilters.Fecha_from}
                    onChange={(e) => setPF("Fecha_from", e.target.value)} />
                </div>
                <div className="field-group">
                  <label htmlFor="pf-fecha-to">Fecha hasta</label>
                  <input id="pf-fecha-to" type="date" value={payloadFilters.Fecha_to}
                    onChange={(e) => setPF("Fecha_to", e.target.value)} />
                </div>
              </div>
              <div className="action-bar">
                <button className="btn btn-primary btn-sm" onClick={() => void applyPayloadFilters()} disabled={!sessionId || loading}>
                  Aplicar filtros ActaArchivada
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPayloadFilters(EMPTY_PAYLOAD_FILTERS)}>
                  Limpiar filtros
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <section className="card">
          <div className="rabbit-header">
            <p className="card__title" style={{ margin: 0 }}>
              <span className="card__title-icon">📋</span>
              Mensajes filtrados
              <span className="rabbit-count">({filteredRows.length} de {rabbitRows.length})</span>
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-secondary btn-sm"
                disabled={filteredRows.length === 0}
                onClick={() => {
                  const text = filteredRows.map((r) => JSON.stringify(r.rabbitPayload)).join("\n");
                  void navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
                📋 Copiar
              </button>
              <button className="btn btn-teal btn-sm"
                disabled={filteredRows.length === 0 || !sessionId}
                onClick={() => void downloadZipFromServer()}>
                🗜 ZIP (server)
              </button>
              <button className="btn btn-secondary btn-sm"
                disabled={filteredRows.length === 0}
                onClick={downloadFilteredJson}>
                ⬇ JSON
              </button>
              {copied && <span className="copied-toast">✓ Copiado</span>}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Tipo Rabbit</th>
                  <th>Payload (JSON)</th>
                  <th>Error type</th>
                  <th>Error</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={`${row.timestamp}-${row.rabbitName}-${i}`}>
                    <td className="mono" style={{ whiteSpace: "nowrap", fontSize: 11 }}>{row.timestamp}</td>
                    <td>
                      <code className="mono" style={{ fontSize: 12, color: "var(--teal)" }}>{row.rabbitName}</code>
                    </td>
                    <td>
                      <MessageCell text={JSON.stringify(row.rabbitPayload, null, 2)} maxLength={80} />
                    </td>
                    <td>
                      <span className={`error-type-badge ${errorTypeCssClass(row.errorType)}`}>{row.errorType}</span>
                    </td>
                    <td style={{ fontSize: 12, color: row.logError || row.parseError ? "var(--error)" : "var(--ink-muted)" }}>
                      {row.logError ?? row.parseError ?? "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setModalRow(row)} title="Ver detalle">🔍</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => downloadSingleMessage(row)} title="Descargar">⬇</button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={6}>No hay mensajes Rabbit para los tipos seleccionados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal */}
      {modalRow && (
        <div className="modal-backdrop" onClick={() => setModalRow(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <span className="modal__title">
                🐇 {modalRow.rabbitName}
                <LevelBadge level={modalRow.level} />
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => void navigator.clipboard.writeText(JSON.stringify(modalRow.rabbitPayload, null, 2))}>
                  📋 Copiar
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadSingleMessage(modalRow)}>⬇ Descargar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setModalRow(null)}>✕ Cerrar</button>
              </div>
            </div>
            <pre>{JSON.stringify(modalRow.rabbitPayload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
