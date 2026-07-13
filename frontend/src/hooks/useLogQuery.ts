import { useState } from "react";
import { requestJson } from "../services/api";
import type { GroupResponse, LogRow, QueryFilters, SearchResponse } from "../types";

const DEFAULT_GROUP_FIELDS = ["level", "service", "logger", "location"];

export const EMPTY_FILTERS: QueryFilters = {
  searchText: "", level: "", service: "", host: "",
  logger: "", location: "", statusCode: "",
  messageText: "", loggerText: "", locationText: "",
};

function buildQueryParams(
  sessionId: string,
  filters: QueryFilters,
  groupFields: string[],
  page: number,
  pageSize: number,
  sortBy: string,
  sortOrder: string,
): URLSearchParams {
  const params = new URLSearchParams({ session_id: sessionId });
  const set = (k: string, v: string) => { if (v) params.set(k, v); };
  set("text",          filters.searchText);
  set("level",         filters.level);
  set("service",       filters.service);
  set("host",          filters.host);
  set("logger",        filters.logger);
  set("location",      filters.location);
  set("status_code",   filters.statusCode);
  set("message_text",  filters.messageText);
  set("logger_text",   filters.loggerText);
  set("location_text", filters.locationText);
  if (groupFields.length > 0) params.set("group_by", groupFields.join(","));
  params.set("page",       String(page));
  params.set("page_size",  String(pageSize));
  params.set("sort_by",    sortBy);
  params.set("sort_order", sortOrder);
  return params;
}

/**
 * Encapsula todo el estado y las operaciones de consulta del explorador de logs:
 * upload, búsqueda, agrupación, ordenación, paginación y export.
 * Extraído de `LogExplorer` para adelgazar el componente y poder testear la
 * lógica de datos de forma aislada.
 */
export function useLogQuery() {
  const [sessionId,   setSessionId]   = useState("");
  const [rowCount,    setRowCount]    = useState<number | undefined>(undefined);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [filters,     setFilters]     = useState<QueryFilters>(EMPTY_FILTERS);
  const [rows,        setRows]        = useState<LogRow[]>([]);
  const [total,       setTotal]       = useState(0);
  const [groups,      setGroups]      = useState<GroupResponse | null>(null);
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(50);
  const [sortBy,      setSortBy]      = useState("timestamp");
  const [sortOrder,   setSortOrder]   = useState("desc");
  const [groupFields, setGroupFields] = useState<string[]>(DEFAULT_GROUP_FIELDS);

  const canQuery = sessionId.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setFilter = (key: keyof QueryFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const toggleGroupField = (field: string) =>
    setGroupFields((cur) =>
      cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field],
    );

  async function runQuery(
    sid = sessionId,
    gf  = groupFields,
    p   = page,
    ps  = pageSize,
    sb  = sortBy,
    so  = sortOrder,
    f   = filters,
  ) {
    if (!sid) return;
    setError("");
    setLoading(true);
    const params = buildQueryParams(sid, f, gf, p, ps, sb, so);
    try {
      const [search, group] = await Promise.all([
        requestJson<SearchResponse>(`/search?${params}`),
        requestJson<GroupResponse>(`/group?${params}`),
      ]);
      setRows(search.items);
      setTotal(search.total);
      setPage(search.page);
      setPageSize(search.page_size);
      setSortBy(search.sort_by);
      setSortOrder(search.sort_order);
      setGroups(group);
      setGroupFields(group.selected_group_fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await requestJson<{ session_id: string; rows: number }>("/upload", {
        method: "POST",
        body: form,
      });
      setSessionId(data.session_id);
      setRowCount(data.rows);
      setPage(1);
      await runQuery(data.session_id, groupFields, 1, pageSize, sortBy, sortOrder, filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    void runQuery(sessionId, groupFields, 1, pageSize, sortBy, sortOrder, filters);
  }

  function handleSort(field: string) {
    const newOrder = sortBy === field && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortOrder(newOrder);
    void runQuery(sessionId, groupFields, 1, pageSize, field, newOrder, filters);
  }

  function exportCsv() {
    if (!sessionId) return;
    const params = buildQueryParams(sessionId, filters, [], page, pageSize, sortBy, sortOrder);
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
    window.open(`${apiUrl}/export?${params}`, "_blank");
  }

  return {
    // estado
    sessionId, rowCount, loading, error, filters, rows, total, groups,
    page, pageSize, sortBy, sortOrder, groupFields, canQuery, totalPages,
    // setters directos usados por la UI
    setPageSize, setSortBy, setSortOrder,
    // acciones
    setFilter, clearFilters, toggleGroupField,
    runQuery, handleUpload, handleSearch, handleSort, exportCsv,
  };
}
