
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
    </div>
  );
}
