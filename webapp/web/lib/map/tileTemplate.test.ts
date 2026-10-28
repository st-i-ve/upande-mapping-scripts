import { describe, it, expect } from "vitest";
import { tileTemplate } from "./tileTemplate";

describe("tileTemplate", () => {
  it("templates z/x/y query parameters and keeps the rest verbatim", () => {
    expect(tileTemplate("https://t.example.com/tile?style=7&z=19&x=315547&y=262087&key=a%2Fb%3D"))
      .toBe("https://t.example.com/tile?style=7&z={z}&x={x}&y={y}&key=a%2Fb%3D");
  });

  it("templates a z/x/y path with its extension", () => {
    expect(tileTemplate("https://a.tile.example.org/16/39276/32755.png"))
      .toBe("https://a.tile.example.org/{z}/{x}/{y}.png");
  });

  it("knows ArcGIS puts the row first", () => {
    expect(tileTemplate("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/32755/39276"))
      .toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
  });

  it("leaves patterns and non-tile URLs alone", () => {
    expect(tileTemplate("https://x.org/{z}/{x}/{y}.png")).toBeNull();
    expect(tileTemplate("https://x.org/images/2024/05/31.png")).toBeNull(); // 2024 isn't a zoom
    expect(tileTemplate("https://x.org/a?z=3&x=99&y=1")).toBeNull(); // x out of range at z3
  });
});
