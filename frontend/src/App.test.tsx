import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LogExplorer from "./App";

const LONG_MESSAGE = "Error crítico de validación en integración RabbitMQ con payload extenso para depuración en modal.".repeat(5);

function buildJsonResponse(payload: unknown) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => payload,
  };
}

beforeEach(() => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("/upload")) {
      return Promise.resolve(buildJsonResponse({ session_id: "session-test", rows: 1 }));
    }

    if (url.includes("/search")) {
      return Promise.resolve(buildJsonResponse({
        items: [
          {
            timestamp: "2026-04-30T10:00:00Z",
            level: "error",
            service: "api",
            host: "host-1",
            logger: "logger.main",
            location: "controller.ts:10",
            method: "POST",
            status_code: "500",
            message: LONG_MESSAGE,
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        sort_by: "timestamp",
        sort_order: "desc",
      }));
    }

    if (url.includes("/group")) {
      return Promise.resolve(buildJsonResponse({
        total_rows: 1,
        available_group_fields: ["level", "service", "logger", "location"],
        selected_group_fields: ["level", "service", "logger", "location"],
        filter_options: {
          logger: ["logger.main"],
          location: ["controller.ts:10"],
          status_code: ["500"],
        },
        diagnostics: [],
        groups: {
          level: { error: 1 },
          service: { api: 1 },
          logger: { "logger.main": 1 },
          location: { "controller.ts:10": 1 },
          status_code: { "500": 1 },
        },
      }));
    }

    return Promise.resolve(buildJsonResponse({
      items: [], total: 0, page: 1, page_size: 50, sort_by: "timestamp", sort_order: "desc",
    }));
  });

  vi.stubGlobal("fetch", fetchMock);

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("LogExplorer", () => {
  it("renders the upload dropzone", () => {
    render(
      <MemoryRouter>
        <LogExplorer />
      </MemoryRouter>
    );
    expect(screen.getByText(/Cargar CSV de Kibana/i)).toBeInTheDocument();
    expect(screen.getByText(/Arrastra tu CSV aquí/i)).toBeInTheDocument();
  });

  it("renders the filters section", () => {
    render(
      <MemoryRouter>
        <LogExplorer />
      </MemoryRouter>
    );
    expect(screen.getByText(/Filtros y búsqueda/i)).toBeInTheDocument();
  });

  it("renders the results section", () => {
    render(
      <MemoryRouter>
        <LogExplorer />
      </MemoryRouter>
    );
    expect(screen.getByText(/Resultados/i)).toBeInTheDocument();
  });

  it("opens message modal and copies full text", async () => {
    render(
      <MemoryRouter>
        <LogExplorer />
      </MemoryRouter>
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["timestamp,message\n2026-04-30,Error"], "logs.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const viewButton = await screen.findByRole("button", { name: /Ver/i });
    fireEvent.click(viewButton);

    expect(screen.getByText(/Detalle de message/i)).toBeInTheDocument();
    expect(screen.getByText(LONG_MESSAGE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LONG_MESSAGE);
    });
  });
});
