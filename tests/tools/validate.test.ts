/**
 * Tests for validate_patch tool handler.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { executeValidatePatch } from "../../src/tools/validate.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");

function fixturePath(name: string): string {
  return path.join(FIXTURES, name);
}

describe("executeValidatePatch", () => {
  // -----------------------------------------------------------------------
  // Valid patch
  // -----------------------------------------------------------------------
  it("reports VALID for a clean patch", async () => {
    const result = await executeValidatePatch(
      fixturePath("hello-world.pd"),
    );

    expect(result).toContain("VALID");
    expect(result).toContain("No errors found");
    expect(result).toContain("0 errors");
  });

  // -----------------------------------------------------------------------
  // Invalid patch with broken connections
  // -----------------------------------------------------------------------
  it("reports INVALID for broken connections", async () => {
    const result = await executeValidatePatch(
      fixturePath("broken-connections.pd"),
    );

    expect(result).toContain("INVALID");
    expect(result).toContain("[ERROR]");
  });

  // -----------------------------------------------------------------------
  // Patch with orphan objects (warnings)
  // -----------------------------------------------------------------------
  it("reports warnings for orphan objects", async () => {
    const result = await executeValidatePatch(
      fixturePath("orphan-objects.pd"),
    );

    expect(result).toContain("[WARN]");
    expect(result).toMatch(/ORPHAN_OBJECT/);
  });

  // -----------------------------------------------------------------------
  // File path → includes filename in header
  // -----------------------------------------------------------------------
  it("includes filename in header when using file path", async () => {
    const result = await executeValidatePatch(
      fixturePath("hello-world.pd"),
    );

    expect(result).toContain("# Validation: hello-world.pd");
    expect(result).toContain("Path:");
  });

  // -----------------------------------------------------------------------
  // Raw text → generic header
  // -----------------------------------------------------------------------
  it("uses generic header when parsing raw text", async () => {
    const raw = `#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 1 0 2 1;`;
    const result = await executeValidatePatch(raw);

    expect(result).toContain("# Validation Report");
    expect(result).not.toContain("# Validation:");
  });

  // -----------------------------------------------------------------------
  // Summary line format
  // -----------------------------------------------------------------------
  it("includes summary with error/warning/info counts", async () => {
    const result = await executeValidatePatch(
      fixturePath("broken-connections.pd"),
    );

    expect(result).toMatch(/Summary: \d+ errors, \d+ warnings, \d+ info/);
  });

  // -----------------------------------------------------------------------
  // No issues → "No issues detected"
  // -----------------------------------------------------------------------
  it("shows 'No issues detected' for perfect patch", async () => {
    // A simple valid patch with no orphans or issues
    const raw = `#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 1 0 2 1;`;
    const result = await executeValidatePatch(raw);

    expect(result).toContain("No issues detected");
  });

  // -----------------------------------------------------------------------
  // Severity grouping in output
  // -----------------------------------------------------------------------
  it("groups issues by severity", async () => {
    const result = await executeValidatePatch(
      fixturePath("broken-connections.pd"),
    );

    // Should have at least an Errors section
    expect(result).toMatch(/## Errors \(\d+\)/);
  });
});
