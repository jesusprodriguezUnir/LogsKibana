import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LogExplorer from "./App";

// Mock fetch so the component doesn't make real HTTP calls
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ items: [], total: 0, page: 1, page_size: 50, sort_by: "timestamp", sort_order: "desc" }),
  }));
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
});
