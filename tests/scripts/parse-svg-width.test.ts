import { describe, it, expect } from "vitest";
import { parseSvgWidth } from "../../scripts/parse-svg-width.js";

describe("parseSvgWidth", () => {
  it("parses mm width → HP (50.8mm = 10 HP)", () => {
    const svg = `<svg width="50.8mm" height="128.5mm" viewBox="0 0 50.8 128.5">`;
    expect(parseSvgWidth(svg)).toBe(10);
  });

  it("parses mm width → HP (25.4mm = 5 HP)", () => {
    const svg = `<svg width="25.4mm" height="128.5mm">`;
    expect(parseSvgWidth(svg)).toBe(5);
  });

  it("parses px width → HP (150px ≈ 10 HP)", () => {
    const svg = `<svg width="150" height="380">`;
    expect(parseSvgWidth(svg)).toBe(10);
  });

  it("returns default 10 HP when no width found", () => {
    const svg = `<svg viewBox="0 0 100 380">`;
    expect(parseSvgWidth(svg)).toBe(10);
  });

  it("returns default 10 HP for zero or negative width", () => {
    expect(parseSvgWidth(`<svg width="0mm" height="128.5mm">`)).toBe(10);
    expect(parseSvgWidth(`<svg width="-50mm" height="128.5mm">`)).toBe(10);
  });
});
