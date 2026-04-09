import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LevelBadge } from "./LevelBadge";

describe("LevelBadge", () => {
  it.each([
    ["error", "✖"],
    ["warning", "⚠"],
    ["info", "ℹ"],
    ["debug", "🐛"],
    ["fatal", "💀"],
  ])("renders %s level with correct icon", (level, icon) => {
    render(<LevelBadge level={level} />);
    expect(screen.getByText(level)).toBeInTheDocument();
  });

  it("applies the correct CSS class for known levels", () => {
    const { container } = render(<LevelBadge level="error" />);
    expect(container.querySelector(".level-badge.error")).toBeTruthy();
  });

  it("applies unknown class for unrecognised level", () => {
    const { container } = render(<LevelBadge level="something" />);
    expect(container.querySelector(".level-badge.something")).toBeTruthy();
  });
});
