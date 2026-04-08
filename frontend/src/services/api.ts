export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

function extractDetail(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("detail" in payload)) {
    return "";
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return "";
        }
        const entry = item as { msg?: unknown; loc?: unknown };
        const msg = typeof entry.msg === "string" ? entry.msg : "";
        const loc = Array.isArray(entry.loc)
          ? entry.loc
              .map((piece) => (typeof piece === "string" || typeof piece === "number" ? String(piece) : ""))
              .filter(Boolean)
              .join(".")
          : "";
        if (msg && loc) {
          return `${loc}: ${msg}`;
        }
        return msg;
      })
      .filter(Boolean);
    return messages.join(" | ");
  }

  return "";
}

function mapApiError(status: number, detail: string): string {
  if (status === 400) {
    return detail || "La solicitud no es valida.";
  }
  if (status === 422) {
    return detail || "La solicitud tiene parametros invalidos.";
  }
  if (status === 404) {
    return detail || "La sesion no existe o expiro.";
  }
  if (status >= 500) {
    return detail || "El backend fallo al procesar la solicitud.";
  }
  return detail || "Error inesperado al comunicar con el backend.";
}

export function buildApiUrl(pathWithQuery: string): string {
  if (pathWithQuery.startsWith("/")) {
    return `${API_URL}${pathWithQuery}`;
  }
  return `${API_URL}/${pathWithQuery}`;
}

export async function requestJson<T>(
  pathWithQuery: string,
  options: RequestInit = {},
  timeoutMs = 30000,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildApiUrl(pathWithQuery), {
      ...options,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? ((await response.json()) as T | { detail?: unknown })
      : ({} as T | { detail?: unknown });

    if (!response.ok) {
      const detail = extractDetail(payload);
      throw new Error(mapApiError(response.status, detail));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tiempo de espera agotado al conectar con el backend.");
    }

    if (error instanceof TypeError) {
      throw new Error("No se pudo conectar con el backend.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
