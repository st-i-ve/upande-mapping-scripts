import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders its label with the status role", () => {
    render(<StatusBadge status="ok">generated</StatusBadge>);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent("generated");
  });

  it("marks the busy state with a pulse animation", () => {
    render(<StatusBadge status="busy">working…</StatusBadge>);
    // The ◍ marker carries the animate-pulse class in the busy state.
    expect(screen.getByRole("status").querySelector(".animate-pulse")).toBeTruthy();
  });
});
