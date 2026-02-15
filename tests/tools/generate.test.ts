/**
 * Tests for generate_patch tool handler.
 */

import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import {
  executeGeneratePatch,
  formatGenerateResult,
} from "../../src/tools/generate.js";

describe("executeGeneratePatch", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("generates valid .pd content from minimal spec", async () => {
    const result = await executeGeneratePatch({
      nodes: [{ name: "osc~", args: [440] }],
      connections: [],
    });

    expect(result.content).toContain("#N canvas");
    expect(result.content).toContain("osc~ 440");
    expect(result.writtenTo).toBeUndefined();
  });

  it("includes title comment when provided", async () => {
    const result = await executeGeneratePatch({
      title: "My Test Patch",
      nodes: [{ name: "osc~", args: [440] }],
      connections: [],
    });

    expect(result.content).toContain("My Test Patch");
  });

  it("generates connections between nodes", async () => {
    const result = await executeGeneratePatch({
      nodes: [
        { name: "osc~", args: [440] },
        { name: "*~", args: [0.1] },
        { name: "dac~" },
      ],
      connections: [
        { from: 0, outlet: 0, to: 1, inlet: 0 },
        { from: 1, outlet: 0, to: 2, inlet: 0 },
      ],
    });

    expect(result.content).toContain("#X connect 0 0 1 0");
    expect(result.content).toContain("#X connect 1 0 2 0");
  });

  it("writes file when outputPath is provided", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-gen-"));
    const outputPath = join(tmpDir, "test.pd");

    const result = await executeGeneratePatch({
      nodes: [{ name: "osc~", args: [440] }],
      connections: [],
      outputPath,
    });

    expect(result.writtenTo).toBeDefined();
    const fileStat = await stat(result.writtenTo!);
    expect(fileStat.isFile()).toBe(true);

    const content = await readFile(result.writtenTo!, "utf-8");
    expect(content).toContain("#N canvas");
    expect(content).toBe(result.content);
  });

  it("creates nested directories for outputPath", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-gen-"));
    const outputPath = join(tmpDir, "sub", "dir", "test.pd");

    const result = await executeGeneratePatch({
      nodes: [{ name: "osc~", args: [440] }],
      connections: [],
      outputPath,
    });

    expect(result.writtenTo).toBeDefined();
    const fileStat = await stat(result.writtenTo!);
    expect(fileStat.isFile()).toBe(true);
  });
});

describe("formatGenerateResult", () => {
  it("formats without writtenTo as code block", () => {
    const text = formatGenerateResult({
      content: "#N canvas 0 50 800 600 12;\n#X obj 50 50 osc~ 440;",
    });

    expect(text).toContain("```pd");
    expect(text).toContain("osc~ 440");
    expect(text).toContain("```");
    expect(text).toContain("ALL CONTENT IS ABOVE");
    expect(text).not.toContain("FILE WRITTEN");
  });

  it("formats with writtenTo including file path", () => {
    const text = formatGenerateResult({
      content: "#N canvas 0 50 800 600 12;",
      writtenTo: "/tmp/test.pd",
    });

    expect(text).toContain("FILE WRITTEN SUCCESSFULLY");
    expect(text).toContain("/tmp/test.pd");
    expect(text).toContain("```pd");
  });
});
