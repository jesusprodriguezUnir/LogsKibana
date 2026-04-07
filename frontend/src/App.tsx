import { useMemo, useState, type ChangeEvent } from "react";

type LogRow = {
  timestamp: string;
  level: string;
  service: string;
  host: string;
  logger: string;
  location: string;
  method: string;
  status_code: string;
  message: string;
};

type SearchResponse = {
  total: number;
  page: number;
  page_size: number;
  sort_by: string;
  sort_order: string;
  items: LogRow[];
};

type GroupResponse = {
  total_rows: number;
  available_group_fields: string[];
  selected_group_fields: string[];
  filter_options: {
    logger: string[];
    location: string[];
    status_code: string[];
  };
  diagnostics: Array<{ service: string; status_code: string; logger: string; count: number }>;
  groups: Record<string, Record<string, number>>;
};

type QueryFilters = {
  searchText: string;
  level: string;
  service: string;
  host: string;
  logger: string;
  location: string;
  statusCode: string;
  messageText: string;
  loggerText: string;
  locationText: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
const DEFAULT_GROUP_FIELDS = ["level", "service", "logger", "location"];
const SORT_FIELDS = ["timestamp", "level", "service", "host", "logger", "location", "method", "status_code"];

export function App() {
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [level, setLevel] = useState("");
  const [service, setService] = useState("");
  const [host, setHost] = useState("");
  const [logger, setLogger] = useState("");
  const [location, setLocation] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [messageText, setMessageText] = useState("");
  const [loggerText, setLoggerText] = useState("");
  const [locationText, setLocationText] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<GroupResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");
  const [availableGroupFields, setAvailableGroupFields] = useState<string[]>(DEFAULT_GROUP_FIELDS);
  const [selectedGroupFields, setSelectedGroupFields] = useState<string[]>(DEFAULT_GROUP_FIELDS);

  const currentFilters: QueryFilters = {
    searchText,
    level,
    service,
    host,
    logger,
    location,
    statusCode,
    messageText,
    loggerText,
    locationText,
  };

  const canQuery = useMemo(() => sessionId.length > 0, [sessionId]);

  async function handleUpload(file: File) {
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Error al cargar CSV");
      }
      setSessionId(data.session_id);
      setPage(1);
      await runQuery(data.session_id, selectedGroupFields, 1, pageSize, sortBy, sortOrder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function runQuery(
    currentSessionId = sessionId,
    groupFields = selectedGroupFields,
    currentPage = page,
    currentPageSize = pageSize,
    currentSortBy = sortBy,
    currentSortOrder = sortOrder,
  ) {
    if (!currentSessionId) return;

    setError("");
    setLoading(true);
    const params = buildQueryParams(
      currentSessionId,
      currentFilters,
      groupFields,
      currentPage,
      currentPageSize,
      currentSortBy,
      currentSortOrder,
    );

    try {
      const [searchJson, groupJson] = await Promise.all([
        fetchSearch(params),
        fetchGroup(params),
      ]);

      setRows(searchJson.items);
      setTotal(searchJson.total);
      setPage(searchJson.page);
      setPageSize(searchJson.page_size);
      setSortBy(searchJson.sort_by);
      setSortOrder(searchJson.sort_order);
      const safeGroups = groupJson;
      setGroups(safeGroups);
      setAvailableGroupFields(safeGroups.available_group_fields);
      setSelectedGroupFields(safeGroups.selected_group_fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!sessionId) return;
    const params = buildQueryParams(sessionId, currentFilters, [], page, pageSize, sortBy, sortOrder);
    window.open(`${API_URL}/export?${params.toString()}`, "_blank");
  }

  function toggleGroupField(field: string) {
    setSelectedGroupFields((current) => {
      if (current.includes(field)) {
        return current.filter((item) => item !== field);
      }
      return [...current, field];
    });
  }

  const topLoggers = Object.entries(groups?.groups.logger ?? {}).slice(0, 5);
  const topLocations = Object.entries(groups?.groups.location ?? {}).slice(0, 5);
  const topStatusCodes = Object.entries(groups?.groups.status_code ?? {}).slice(0, 5);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="shell">
      <header>
        <h1>Kibana Logs Explorer</h1>
        <p>Sube un CSV y agrupa de inmediato por los campos detectados del log, incluyendo logger y location.</p>
      </header>

      <section className="card">
        <h2>1) Cargar CSV</h2>
        <input
          type="file"
          accept=".csv"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleUpload(file);
            }
          }}
        />
        <p>Session ID: {sessionId || "sin sesión"}</p>
      </section>

      <section className="card">
        <h2>2) Filtros y búsqueda</h2>
        <div className="grid">
          <input placeholder="Texto libre en message" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          <input placeholder="level exacto (error, info...)" value={level} onChange={(e) => setLevel(e.target.value)} />
          <input placeholder="service" value={service} onChange={(e) => setService(e.target.value)} />
          <input placeholder="host" value={host} onChange={(e) => setHost(e.target.value)} />
          <select value={logger} onChange={(e) => setLogger(e.target.value)}>
            <option value="">logger exacto</option>
            {(groups?.filter_options.logger ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">location exacta</option>
            {(groups?.filter_options.location ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
            <option value="">status_code exacto</option>
            {(groups?.filter_options.status_code ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input placeholder="Buscar en columna message" value={messageText} onChange={(e) => setMessageText(e.target.value)} />
          <input placeholder="Buscar en columna logger" value={loggerText} onChange={(e) => setLoggerText(e.target.value)} />
          <input placeholder="Buscar en columna location" value={locationText} onChange={(e) => setLocationText(e.target.value)} />
        </div>
        <div className="actions">
          <button disabled={!canQuery || loading} onClick={() => void runQuery(sessionId, selectedGroupFields, 1, pageSize, sortBy, sortOrder)}>Buscar</button>
          <button disabled={!canQuery || loading} onClick={exportCsv}>Exportar CSV</button>
        </div>
      </section>

      {groups && (
        <section className="card summary-grid">
          <article>
            <h2>Resumen inicial</h2>
            <p>Total de filas filtradas: {groups.total_rows}</p>
          </article>
          <SummaryPanel title="Top logger" entries={topLoggers} />
          <SummaryPanel title="Top location" entries={topLocations} />
          <SummaryPanel title="Top status_code" entries={topStatusCodes} />
        </section>
      )}

      {groups && (
        <section className="card">
          <h2>Panel diagnóstico</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>service</th>
                  <th>status_code</th>
                  <th>logger</th>
                  <th>count</th>
                </tr>
              </thead>
              <tbody>
                {groups.diagnostics.map((item, index) => (
                  <tr key={`${item.service}-${item.status_code}-${item.logger}-${index}`}>
                    <td>{item.service}</td>
                    <td>{item.status_code}</td>
                    <td>{item.logger}</td>
                    <td>{item.count}</td>
                  </tr>
                ))}
                {groups.diagnostics.length === 0 && (
                  <tr>
                    <td colSpan={4}>Sin datos diagnósticos</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>3) Campos de agrupación</h2>
        <div className="chip-grid">
          {availableGroupFields.map((field) => (
            <label key={field} className="chip">
              <input
                type="checkbox"
                checked={selectedGroupFields.includes(field)}
                onChange={() => toggleGroupField(field)}
              />
              <span>{field}</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <button disabled={!canQuery || loading} onClick={() => void runQuery(sessionId, selectedGroupFields)}>
            Reagrupar
          </button>
        </div>
      </section>

      {error && <section className="error">{error}</section>}

      <section className="card">
        <h2>4) Resultados ({total})</h2>
        <div className="toolbar">
          <label>
            <span>Ordenar por</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_FIELDS.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Orden</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">desc</option>
              <option value="asc">asc</option>
            </select>
          </label>
          <label>
            <span>Filas por página</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button disabled={!canQuery || loading} onClick={() => void runQuery(sessionId, selectedGroupFields, 1, pageSize, sortBy, sortOrder)}>
            Aplicar tabla
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>timestamp</th>
                <th>level</th>
                <th>service</th>
                <th>host</th>
                <th>logger</th>
                <th>location</th>
                <th>method</th>
                <th>status_code</th>
                <th>message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.timestamp}-${idx}`}>
                  <td>{row.timestamp}</td>
                  <td>{row.level}</td>
                  <td>{row.service}</td>
                  <td>{row.host}</td>
                  <td>{row.logger}</td>
                  <td>{row.location}</td>
                  <td>{row.method}</td>
                  <td>{row.status_code}</td>
                  <td>{row.message}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9}>Sin resultados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button disabled={!canQuery || loading || page <= 1} onClick={() => void runQuery(sessionId, selectedGroupFields, page - 1, pageSize, sortBy, sortOrder)}>
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={!canQuery || loading || page >= totalPages} onClick={() => void runQuery(sessionId, selectedGroupFields, page + 1, pageSize, sortBy, sortOrder)}>
            Siguiente
          </button>
        </div>
      </section>

      <section className="card">
        <h2>5) Agrupaciones</h2>
        {!groups && <p>Ejecuta una búsqueda para ver agrupaciones.</p>}
        {groups && (
          <div className="groups">
            {Object.entries(groups.groups).map(([field, values]) => (
              <GroupPanel key={field} title={`Por ${field}`} values={values} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function buildQueryParams(
  sessionId: string,
  filters: QueryFilters,
  groupFields: string[],
  page: number,
  pageSize: number,
  sortBy: string,
  sortOrder: string,
) {
  const params = new URLSearchParams({ session_id: sessionId });

  setParam(params, "text", filters.searchText);
  setParam(params, "level", filters.level);
  setParam(params, "service", filters.service);
  setParam(params, "host", filters.host);
  setParam(params, "logger", filters.logger);
  setParam(params, "location", filters.location);
  setParam(params, "status_code", filters.statusCode);
  setParam(params, "message_text", filters.messageText);
  setParam(params, "logger_text", filters.loggerText);
  setParam(params, "location_text", filters.locationText);

  if (groupFields.length > 0) {
    params.set("group_by", groupFields.join(","));
  }
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  params.set("sort_by", sortBy);
  params.set("sort_order", sortOrder);

  return params;
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  }
}

async function fetchSearch(params: URLSearchParams): Promise<SearchResponse> {
  const response = await fetch(`${API_URL}/search?${params.toString()}`);
  const payload = (await response.json()) as SearchResponse | { detail: string };
  if (!response.ok) {
    throw new Error((payload as { detail: string }).detail || "Fallo búsqueda");
  }
  return payload as SearchResponse;
}

async function fetchGroup(params: URLSearchParams): Promise<GroupResponse> {
  const response = await fetch(`${API_URL}/group?${params.toString()}`);
  const payload = (await response.json()) as GroupResponse | { detail: string };
  if (!response.ok) {
    throw new Error((payload as { detail: string }).detail || "Fallo agrupación");
  }
  return payload as GroupResponse;
}

function GroupPanel({ title, values }: Readonly<{ title: string; values: Record<string, number> }>) {
  const entries = Object.entries(values);
  return (
    <article>
      <h3>{title}</h3>
      <ul>
        {entries.length === 0 && <li>Sin datos</li>}
        {entries.map(([key, value]) => (
          <li key={key}>
            <strong>{key}</strong>: {value}
          </li>
        ))}
      </ul>
    </article>
  );
}

function SummaryPanel({ title, entries }: Readonly<{ title: string; entries: Array<[string, number]> }>) {
  return (
    <article>
      <h2>{title}</h2>
      <ul>
        {entries.length === 0 && <li>Sin datos</li>}
        {entries.map(([key, value]) => (
          <li key={key}>
            <strong>{key}</strong>: {value}
          </li>
        ))}
      </ul>
    </article>
  );
}
