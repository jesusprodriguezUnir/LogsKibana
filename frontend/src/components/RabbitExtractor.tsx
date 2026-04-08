
import { useMemo, useState, type ChangeEvent } from "react";

import { requestJson } from "../services/api";

interface LogRow {
  timestamp: string;
  level: string;
  service: string;
  host: string;
  logger: string;
  location: string;
  method: string;
  status_code: string;
  message: string;
}

interface RabbitRow extends LogRow {
  rabbitName: string;
  rabbitPayload: Record<string, unknown>;
  parseError: string | null;
  logError: string | null;
  errorType: "Exception" | "StatusCode" | "Parseo" | "Sin detalle";
}

interface SearchResponse {
  total?: number;
  page?: number;
  page_size?: number;
  items?: LogRow[];
}

const SEARCH_PAGE_SIZE = 500;

const RABBIT_NAMES = [
  "MatriculaRealizada",
  "MatriculaAnulada",
  "MatriculaRecuperada",
  "MatriculaDesestimada",
  "MatriculaReiniciada",
  "MatriculaAmpliacionReiniciada",
  "MatriculaAmpliacionAnulada",
  "MatriculaAmpliacionDesestimada",
  "MatriculaAmpliacionRecuperada",
  "MatriculaAmpliacionRealizada",
  "MatriculaVariacionAnulada",
  "MatriculaVariacionRealizada",
  "MatriculaVariacionRecuperada",
  "ClienteModificado",
  "DefensaModificada",
  "ActaArchivada",
  "CuentaBloqueada",
  "CuentaDesbloqueada",
  "MatriculaPeriodoAcademicoCambiado",
  "DocumentoFirmado",
  "MatriculaVariacionReiniciada",
  "MatriculaVariacionDesestimada",
  "NotaFinalGenerada",
  "NotaDesglosadaModificada",
  "ExpedientesMigrados",
  "ProgresoEstudianteActualizado",
  "DiligenciaResuelta",
  "ConvocatoriasTFECerradas",
  "DiligenciaCerrada",
  "ActaCancelada",
  "FechaPagoTituloSolicitado",
] as const;

const LIMPIOS = new Set<string>(["NotaFinalGenerada", "NotaDesglosadaModificada", "ActaArchivada"]);

function extractRabbitName(message: string): string | null {
  return RABBIT_NAMES.find((name) => message.includes(name)) ?? null;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractBalancedJsonBlock(input: string): string | null {
  let depth = 0;
  let start = -1;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return input.slice(start, i + 1);
      }
      if (depth < 0) {
        return null;
      }
    }
  }

  return null;
}

function extraerJsonLimpio(texto: string, rabbitName: string): Record<string, unknown> | null {
  if (rabbitName === "ActaArchivada") {
    const messageRegex = /"Message"\s*:\s*"([^"]+)"/;
    const match = messageRegex.exec(texto);
    if (match) {
      const decoded = match[1]
        .replace(/\/u0022/g, '"')
        .replace(/\/u002c/g, ",")
        .replace(/\/u002f/g, "/")
        .replace(/\/u003a/g, ":");
      const parsedActa = tryParseJson(decoded);
      if (parsedActa) {
        return parsedActa;
      }
    }
  }

  const requestRegex = /Request:\s*(\{.*\})/s;
  const requestMatch = requestRegex.exec(texto);
  const candidate = requestMatch ? requestMatch[1] : texto.slice(Math.max(0, texto.indexOf("{")));
  if (!candidate?.includes("{")) {
    return null;
  }

  const block = extractBalancedJsonBlock(candidate);
  if (!block) {
    return null;
  }

  return tryParseJson(block);
}

function buildRabbitPayloadResult(
  row: LogRow,
  rabbitName: string,
): { rabbitPayload: Record<string, unknown>; parseError: string | null } {
  if (LIMPIOS.has(rabbitName)) {
    const limpio = extraerJsonLimpio(row.message, rabbitName);
    if (limpio) {
      return { rabbitPayload: limpio, parseError: null };
    }

    return {
      rabbitPayload: {
        rabbit_name: rabbitName,
        timestamp: row.timestamp,
        message: row.message,
      },
      parseError: "No se pudo extraer JSON limpio",
    };
  }

  return {
    rabbitPayload: {
      rabbit_name: rabbitName,
      timestamp: row.timestamp,
      message: row.message,
    },
    parseError: null,
  };
}

function extractLogError(message: string): string | null {
  const exceptionRegex = /Exception caught:\s*(.*?)(?:\s*\.\s*RabbitMQ message End on:|\s*RabbitMQ message End on:|$)/s;
  const exceptionMatch = exceptionRegex.exec(message);
  if (exceptionMatch?.[1]) {
    return exceptionMatch[1].trim();
  }

  const statusCodeRegex = /StatusCode:\s*([^,\s]+)/i;
  const statusCodeMatch = statusCodeRegex.exec(message);
  if (statusCodeMatch?.[1] && statusCodeMatch[1].toLowerCase() !== "ok") {
    return `StatusCode: ${statusCodeMatch[1]}`;
  }

  return null;
}

function classifyErrorType(logError: string | null, parseError: string | null): RabbitRow["errorType"] {
  if (logError?.startsWith("StatusCode:")) {
    return "StatusCode";
  }
  if (logError) {
    return "Exception";
  }
  if (parseError) {
    return "Parseo";
  }
  return "Sin detalle";
}

export default function RabbitExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [selectedRabbitNames, setSelectedRabbitNames] = useState<string[]>([...RABBIT_NAMES]);
  const [modalRow, setModalRow] = useState<RabbitRow | null>(null);
  // Payload filters for ActaArchivada
  const [payload_IdActa, setPayload_IdActa] = useState<string>("");
  const [payload_Fecha_from, setPayload_Fecha_from] = useState<string>("");
  const [payload_Fecha_to, setPayload_Fecha_to] = useState<string>("");
  const [payload_IdClase, setPayload_IdClase] = useState<string>("");
  const [payload_TipoEvaluacion, setPayload_TipoEvaluacion] = useState<string>("");
  const [payload_IdAlumnoIntegracion, setPayload_IdAlumnoIntegracion] = useState<string>("");
  const [payload_OrigenActa, setPayload_OrigenActa] = useState<string>("");

  const rabbitRows = useMemo<RabbitRow[]>(() => {
    return rows
      .map((row) => {
        const rabbitName = extractRabbitName(row.message);
        if (!rabbitName) {
          return null;
        }
        const { rabbitPayload, parseError } = buildRabbitPayloadResult(row, rabbitName);
        const logError = extractLogError(row.message);
        const errorType = classifyErrorType(logError, parseError);
        return { ...row, rabbitName, rabbitPayload, parseError, logError, errorType };
      })
      .filter((row): row is RabbitRow => row !== null);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedRabbitNames.length === 0) {
      return [];
    }
    const selected = new Set(selectedRabbitNames);
    return rabbitRows.filter((row) => selected.has(row.rabbitName));
  }, [rabbitRows, selectedRabbitNames]);

  const detectedRabbitNames = useMemo(() => {
    return Array.from(new Set(rabbitRows.map((row) => row.rabbitName)));
  }, [rabbitRows]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setRows([]);
      setError(null);
      setStatusMessage("");
    }
  };

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setRows([]);
    setSessionId("");
    setCopied(false);
    try {
      const formData = new FormData();
      formData.append("file", file);

      setStatusMessage("Paso 1/2: subiendo CSV...");
      const uploadData = await requestJson<{ session_id?: string }>("/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadData.session_id) {
        throw new Error("El backend no devolvio un session_id valido.");
      }
      setSessionId(uploadData.session_id);

      setStatusMessage("Paso 2/2: extrayendo mensajes...");
      const firstPageParams = new URLSearchParams({
        session_id: uploadData.session_id,
        page: "1",
        page_size: String(SEARCH_PAGE_SIZE),
        sort_by: "timestamp",
        sort_order: "desc",
      });

      const firstPage = await requestJson<SearchResponse>(`/search?${firstPageParams.toString()}`);
      const collectedRows = [...(firstPage.items || [])];
      const total = firstPage.total ?? collectedRows.length;
      const pageSize = firstPage.page_size ?? SEARCH_PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      for (let page = 2; page <= totalPages; page += 1) {
        const pageParams = new URLSearchParams({
          session_id: uploadData.session_id,
          page: String(page),
          page_size: String(pageSize),
          sort_by: "timestamp",
          sort_order: "desc",
        });
        const nextPage = await requestJson<SearchResponse>(`/search?${pageParams.toString()}`);
        if (nextPage.items?.length) {
          collectedRows.push(...nextPage.items);
        }
      }

      setRows(collectedRows);
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
      const params = new URLSearchParams({
        session_id: sessionId,
        page: "1",
        page_size: String(SEARCH_PAGE_SIZE),
        sort_by: "timestamp",
        sort_order: "desc",
      });

      if (payload_IdActa) params.set("payload.IdActa", payload_IdActa);
      if (payload_Fecha_from) params.set("payload.Fecha_from", payload_Fecha_from);
      if (payload_Fecha_to) params.set("payload.Fecha_to", payload_Fecha_to);
      if (payload_IdClase) params.set("payload.IdClase", payload_IdClase);
      if (payload_TipoEvaluacion) params.set("payload.TipoEvaluacion", payload_TipoEvaluacion);
      if (payload_IdAlumnoIntegracion) params.set("payload.IdAlumnoIntegracion", payload_IdAlumnoIntegracion);
      if (payload_OrigenActa) params.set("payload.OrigenActa", payload_OrigenActa);

      const firstPage = await requestJson<SearchResponse>(`/search?${params.toString()}`);
      const collectedRows = [...(firstPage.items || [])];
      const total = firstPage.total ?? collectedRows.length;
      const pageSize = firstPage.page_size ?? SEARCH_PAGE_SIZE;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      for (let page = 2; page <= totalPages; page += 1) {
        params.set("page", String(page));
        const nextPage = await requestJson<SearchResponse>(`/search?${params.toString()}`);
        if (nextPage.items?.length) {
          collectedRows.push(...nextPage.items);
        }
      }

      setRows(collectedRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error aplicando filtros");
    } finally {
      setLoading(false);
    }
  };

  const clearPayloadFilters = () => {
    setPayload_IdActa("");
    setPayload_Fecha_from("");
    setPayload_Fecha_to("");
    setPayload_IdClase("");
    setPayload_TipoEvaluacion("");
    setPayload_IdAlumnoIntegracion("");
    setPayload_OrigenActa("");
  };

  const toggleRabbitName = (rabbitName: string) => {
    setSelectedRabbitNames((current) => {
      if (current.includes(rabbitName)) {
        return current.filter((item) => item !== rabbitName);
      }
      return [...current, rabbitName];
    });
  };

  const selectAllDetected = () => {
    setSelectedRabbitNames(detectedRabbitNames);
  };

  const clearSelection = () => {
    setSelectedRabbitNames([]);
  };

  const downloadFilteredJson = () => {
    if (filteredRows.length === 0) {
      return;
    }

    const payload = filteredRows.map((row) => ({
      rabbit_name: row.rabbitName,
      timestamp: row.timestamp,
      payload: row.rabbitPayload,
      error_type: row.errorType,
      log_error: row.logError,
      parse_error: row.parseError,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rabbit_filtrados_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadZipFromServer = async () => {
    if (!sessionId || filteredRows.length === 0) return;
    try {
      const messageText = selectedRabbitNames.length > 0 ? selectedRabbitNames.map(encodeURIComponent).join("|") : "";
      const params = new URLSearchParams({ session_id: sessionId });
      if (messageText) params.set("message_text", selectedRabbitNames.join("|"));
      const url = `/export_zip?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Error en export ZIP: ${resp.statusText}`);
      const blob = await resp.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `rabbit_messages_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
    }
  };

  const openModal = (row: RabbitRow) => setModalRow(row);
  const closeModal = () => setModalRow(null);

  const downloadSingleMessage = (row: RabbitRow) => {
    const filename = `message_${row.rabbitName}_${row.timestamp.replace(/[:.]/g, "-")}.txt`;
    const meta = {
      timestamp: row.timestamp,
      service: row.service,
      logger: row.logger,
      location: row.location,
      error_type: row.errorType,
      log_error: row.logError,
      parse_error: row.parseError,
    };
    const content = `METADATA:\n${JSON.stringify(meta, null, 2)}\n\nMESSAGE:\n${JSON.stringify(row.rabbitPayload, null, 2)}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001' }}>
      <h2>Extractor de mensajes RabbitMQ</h2>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      <button onClick={handleExtract} disabled={!file || loading} style={{ marginLeft: 16 }}>
        {loading ? "Procesando..." : "Extraer mensajes"}
      </button>
      {statusMessage && <div style={{ marginTop: 8, color: "#333" }}>{statusMessage}</div>}
      {error && <div style={{ color: 'red', marginTop: 16 }}>{error}</div>}
      {sessionId && !error && (
        <div style={{ marginTop: 8, color: "#555", fontSize: 12 }}>
          Session ID: {sessionId}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>
            Mensajes RabbitMQ detectados ({filteredRows.length} / {rabbitRows.length} de {rows.length} filas)
          </h3>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={selectAllDetected} type="button" disabled={detectedRabbitNames.length === 0}>
              Seleccionar detectados
            </button>
            <button onClick={clearSelection} type="button" disabled={selectedRabbitNames.length === 0}>
              Limpiar seleccion
            </button>
          </div>
          {detectedRabbitNames.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                maxHeight: 180,
                overflowY: "auto",
                border: "1px solid #eee",
                borderRadius: 4,
                padding: 8,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 6,
              }}
            >
              {detectedRabbitNames.map((rabbitName) => (
                <label key={rabbitName} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedRabbitNames.includes(rabbitName)}
                    onChange={() => toggleRabbitName(rabbitName)}
                  />
                  <span>{rabbitName}</span>
                </label>
              ))}
            </div>
          )}
          {/* Payload filters for ActaArchivada */}
          {detectedRabbitNames.includes("ActaArchivada") && (
            <div style={{ marginTop: 12, padding: 12, border: '1px dashed #ddd', borderRadius: 6 }}>
              <h4 style={{ marginTop: 0 }}>Filtros ActaArchivada</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  IdActa:
                  <input type="text" value={payload_IdActa} onChange={(e) => setPayload_IdActa(e.target.value)} />
                </label>
                <label>
                  IdClase:
                  <input type="text" value={payload_IdClase} onChange={(e) => setPayload_IdClase(e.target.value)} />
                </label>
                <label>
                  TipoEvaluacion:
                  <input type="text" value={payload_TipoEvaluacion} onChange={(e) => setPayload_TipoEvaluacion(e.target.value)} />
                </label>
                <label>
                  IdAlumnoIntegracion:
                  <input type="text" value={payload_IdAlumnoIntegracion} onChange={(e) => setPayload_IdAlumnoIntegracion(e.target.value)} />
                </label>
                <label>
                  OrigenActa:
                  <input type="text" value={payload_OrigenActa} onChange={(e) => setPayload_OrigenActa(e.target.value)} />
                </label>
                <div>
                  Fecha desde:
                  <input type="date" value={payload_Fecha_from} onChange={(e) => setPayload_Fecha_from(e.target.value)} />
                </div>
                <div>
                  Fecha hasta:
                  <input type="date" value={payload_Fecha_to} onChange={(e) => setPayload_Fecha_to(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={applyPayloadFilters} disabled={!sessionId}>Aplicar filtros ActaArchivada</button>
                <button onClick={clearPayloadFilters}>Limpiar filtros</button>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              const text = filteredRows.map((r) => JSON.stringify(r.rabbitPayload)).join("\n");
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{ marginBottom: 12 }}
            disabled={filteredRows.length === 0}
          >
            Copiar mensajes filtrados
          </button>
          <button
            onClick={downloadZipFromServer}
            type="button"
            style={{ marginBottom: 12, marginLeft: 8 }}
            disabled={filteredRows.length === 0 || !sessionId}
          >
            Descargar ZIP (server)
          </button>
          <button
            onClick={downloadFilteredJson}
            type="button"
            style={{ marginBottom: 12, marginLeft: 8 }}
            disabled={filteredRows.length === 0}
          >
            Descargar JSON filtrado
          </button>
          {copied && <span style={{ color: 'green', marginLeft: 8 }}>¡Copiado!</span>}
          <div style={{ overflowX: 'auto', maxHeight: 500, border: '1px solid #eee', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ddd', padding: 4 }}>Timestamp</th>
                  <th style={{ border: '1px solid #ddd', padding: 4 }}>Tipo Rabbit</th>
                  <th style={{ border: '1px solid #ddd', padding: 4 }}>Mensaje Rabbit (JSON)</th>
                  <th style={{ border: '1px solid #ddd', padding: 4 }}>Tipo de error</th>
                  <th style={{ border: '1px solid #ddd', padding: 4 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={`${row.timestamp}-${row.rabbitName}-${row.logger}-${row.location}-${row.message}`}>
                    <td style={{ border: '1px solid #eee', padding: 4, whiteSpace: 'nowrap' }}>{row.timestamp}</td>
                    <td style={{ border: '1px solid #eee', padding: 4, whiteSpace: 'nowrap' }}>{row.rabbitName}</td>
                    <td style={{ border: '1px solid #eee', padding: 4, fontFamily: 'monospace' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.rabbitPayload, null, 2)}</pre>
                    </td>
                    <td style={{ border: '1px solid #eee', padding: 4, whiteSpace: 'nowrap' }}>
                      <button onClick={() => openModal(row)} title="Ver detalle" style={{ marginRight: 6 }}>🔍</button>
                      <button onClick={() => downloadSingleMessage(row)} title="Descargar este mensaje">⬇️</button>
                    </td>
                    <td style={{ border: '1px solid #eee', padding: 4, whiteSpace: 'nowrap' }}>{row.errorType}</td>
                    <td style={{ border: '1px solid #eee', padding: 4, color: row.logError || row.parseError ? '#b00020' : '#555' }}>
                      {row.logError ?? row.parseError ?? "Sin detalle de error en el texto"}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ border: '1px solid #eee', padding: 8 }}>
                      No hay mensajes Rabbit para los tipos seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modalRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={closeModal}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: '80%', maxHeight: '80%', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h4>Detalle mensaje — {modalRow.rabbitName}</h4>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(modalRow.rabbitPayload, null, 2)); }}>Copiar</button>
              <button onClick={() => downloadSingleMessage(modalRow)}>Descargar</button>
              <button onClick={closeModal}>Cerrar</button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify(modalRow.rabbitPayload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
