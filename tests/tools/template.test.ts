/**
 * Tests for create_from_template tool handler.
 */

import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { executeCreateFromTemplate } from "../../src/tools/template.js";

describe("executeCreateFromTemplate", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("generates synth template without outputPath", async () => {
    const result = await executeCreateFromTemplate({ template: "synth" });

    expect(result).toContain('Template "synth" generated successfully');
    expect(result).toContain("#N canvas");
    expect(result).toContain("ALL CONTENT IS ABOVE");
    expect(result).not.toContain("Written to:");
  });

  it("generates clock template with custom params", async () => {
    const result = await executeCreateFromTemplate({
      template: "clock",
      params: { bpm: 140 },
    });

    expect(result).toContain('Template "clock" generated successfully');
    expect(result).toContain("#N canvas");
  });

  it("writes file when outputPath is provided", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-tpl-"));
    const outputPath = join(tmpDir, "synth.pd");

    const result = await executeCreateFromTemplate({
      template: "synth",
      outputPath,
    });

    expect(result).toContain("Written to:");
    expect(result).toContain("FILE WRITTEN SUCCESSFULLY");

    const fileStat = await stat(outputPath);
    expect(fileStat.isFile()).toBe(true);

    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("#N canvas");
  });

  it("throws for invalid template name", async () => {
    await expect(
      executeCreateFromTemplate({ template: "nonexistent" }),
    ).rejects.toThrow(/Unknown template/);
  });

  it("generates all valid templates", async () => {
    const templates = [
      "synth", "sequencer", "reverb", "mixer", "drum-machine",
      "clock", "chaos", "maths", "turing-machine", "granular", "bridge",
    ];

    for (const template of templates) {
      const result = await executeCreateFromTemplate({ template });
      expect(result).toContain(`Template "${template}" generated successfully`);
      expect(result).toContain("#N canvas");
    }
  });

  it("creates nested directories for outputPath", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-tpl-"));
    const outputPath = join(tmpDir, "sub", "dir", "mixer.pd");

    const result = await executeCreateFromTemplate({
      template: "mixer",
      outputPath,
    });

    expect(result).toContain("Written to:");
    const fileStat = await stat(outputPath);
    expect(fileStat.isFile()).toBe(true);
  });
});
