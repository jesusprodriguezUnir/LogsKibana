import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders title", () => {
    render(<App />);
    expect(screen.getByText("Kibana Logs Explorer")).toBeInTheDocument();
  });
});
