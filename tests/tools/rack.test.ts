import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { executeCreateRack } from "../../src/tools/rack.js";
import { buildPatch } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
import { buildTemplate, TEMPLATE_NAMES } from "../../src/templates/index.js";

describe("create_rack tool", () => {
  // -----------------------------------------------------------------------
  // 1. Builds rack with 3 modules (default params)
  // -----------------------------------------------------------------------
  it("builds rack with 3 modules", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth" },
        { template: "drum-machine" },
        { template: "reverb" },
      ],
    });

    // Should contain all 3 individual modules
    expect(result).toContain("--- synth.pd ---");
    expect(result).toContain("--- drum-machine.pd ---");
    expect(result).toContain("--- reverb.pd ---");
    // Should contain combined rack
    expect(result).toContain("--- _rack.pd (combined) ---");
    // All sections should have valid Pd canvas headers
    expect(result.match(/#N canvas/g)!.length).toBeGreaterThanOrEqual(4);
    expect(result).toContain("3 modules + 1 combined patch");
  });

  // -----------------------------------------------------------------------
  // 2. Auto-generates filenames with dedup
  // -----------------------------------------------------------------------
  it("auto-generates filenames with dedup for duplicate templates", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth" },
        { template: "synth" },
        { template: "synth" },
      ],
    });

    expect(result).toContain("--- synth.pd ---");
    expect(result).toContain("--- synth-2.pd ---");
    expect(result).toContain("--- synth-3.pd ---");
  });

  // -----------------------------------------------------------------------
  // 3. Uses custom filenames as-is
  // -----------------------------------------------------------------------
  it("uses custom filenames", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "drum-machine", filename: "kick.pd" },
        { template: "synth", filename: "lead.pd" },
      ],
    });

    expect(result).toContain("--- kick.pd ---");
    expect(result).toContain("--- lead.pd ---");
  });

  // -----------------------------------------------------------------------
  // 4. Enforces .pd extension (Audit fix #2)
  // -----------------------------------------------------------------------
  it("enforces .pd extension on custom filenames", async () => {
    const result = await executeCreateRack({
      modules: [{ template: "drum-machine", filename: "my-drums" }],
    });

    expect(result).toContain("--- my-drums.pd ---");
    expect(result).not.toContain("--- my-drums ---");
  });

  // -----------------------------------------------------------------------
  // 5. Single module (no dedup, no cross-wiring)
  // -----------------------------------------------------------------------
  it("builds single module rack", async () => {
    const result = await executeCreateRack({
      modules: [{ template: "clock", params: { bpm: 140 } }],
    });

    expect(result).toContain("1 modules + 1 combined patch");
    expect(result).toContain("--- clock.pd ---");
    expect(result).toContain("--- _rack.pd (combined) ---");
    expect(result).toContain("#N canvas");
  });

  // -----------------------------------------------------------------------
  // 6. Combined patch has objects from all modules
  // -----------------------------------------------------------------------
  it("combined patch contains objects from all modules", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth" },
        { template: "drum-machine" },
      ],
    });

    // Extract the combined patch section
    const rackSection = result.split("--- _rack.pd (combined) ---")[1];
    expect(rackSection).toBeDefined();

    // Synth contributes osc~ or phasor~, drums contribute noise~
    expect(rackSection).toMatch(/phasor~/);
    expect(rackSection).toMatch(/noise~/);
    // Rack title
    expect(rackSection).toContain("=== RACK ===");
  });

  // -----------------------------------------------------------------------
  // 7. Combined patch deduplicates table names (Audit fix #1)
  // -----------------------------------------------------------------------
  it("deduplicates table names in combined patch", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "turing-machine" },
        { template: "turing-machine" },
      ],
    });

    // Extract the combined patch section
    const rackSection = result.split("--- _rack.pd (combined) ---")[1];
    expect(rackSection).toBeDefined();

    // First module gets _0, second gets _1
    expect(rackSection).toContain("turing_seq_0");
    expect(rackSection).toContain("turing_seq_1");
    // The individual files should NOT be deduplicated
    const firstTuring = result.split("--- turing-machine.pd ---")[1]
      .split("```")[1];
    expect(firstTuring).toContain("turing_seq");
    expect(firstTuring).not.toContain("turing_seq_0");
  });

  // -----------------------------------------------------------------------
  // 8. All 10 templates build as rack without error
  // -----------------------------------------------------------------------
  it("builds rack with all 10 templates without error", async () => {
    const modules = TEMPLATE_NAMES.map((name) => ({ template: name }));
    const result = await executeCreateRack({ modules });

    expect(result).toContain(`${TEMPLATE_NAMES.length} modules + 1 combined patch`);
    // Every template should produce a valid Pd file section
    for (const name of TEMPLATE_NAMES) {
      expect(result).toContain(`--- ${name}.pd ---`);
    }
    // Combined rack should be valid
    expect(result).toContain("--- _rack.pd (combined) ---");
  });

  // -----------------------------------------------------------------------
  // 9. Throws on invalid template with module index in error
  // -----------------------------------------------------------------------
  it("throws on invalid template with module index in error message", async () => {
    await expect(
      executeCreateRack({
        modules: [
          { template: "synth" },
          { template: "nonexistent-module" },
        ],
      }),
    ).rejects.toThrow(/Error in module 2/);
  });

  // -----------------------------------------------------------------------
  // 10. File writing with outputDir (temp dir)
  // -----------------------------------------------------------------------
  describe("file writing", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "pd-rack-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("writes individual files + _rack.pd to outputDir", async () => {
      const result = await executeCreateRack({
        modules: [
          { template: "clock", params: { bpm: 120 } },
          { template: "synth" },
          { template: "mixer", params: { channels: 4 } },
        ],
        outputDir: tempDir,
      });

      // Verify result message
      expect(result).toContain("Written to:");
      expect(result).toContain("clock.pd");
      expect(result).toContain("synth.pd");
      expect(result).toContain("mixer.pd");
      expect(result).toContain("_rack.pd");

      // Verify files exist and have valid Pd content
      for (const fn of ["clock.pd", "synth.pd", "mixer.pd", "_rack.pd"]) {
        const filePath = join(tempDir, fn);
        const fileStat = await stat(filePath);
        expect(fileStat.isFile()).toBe(true);

        const content = await readFile(filePath, "utf-8");
        expect(content).toContain("#N canvas");
      }

      // Verify _rack.pd has rack title
      const rackContent = await readFile(join(tempDir, "_rack.pd"), "utf-8");
      expect(rackContent).toContain("=== RACK ===");
    });
  });

  // -----------------------------------------------------------------------
  // Layout regression: Y coordinates stay bounded in combined rack
  // -----------------------------------------------------------------------
  describe("rack layout Y coordinates", () => {
    /** Parse a _rack.pd from inline result and extract all Y coords. */
    function extractYCoords(result: string): number[] {
      const marker = "--- _rack.pd (combined) ---";
      const section = result.split(marker)[1];
      const match = section.match(/```pd\n([\s\S]*?)```/);
      const pd = match ? match[1] : "";
      const parsed = parsePatch(pd);
      return parsed.root.nodes.map((n) => n.y);
    }

    it("all 10 templates: no Y coordinate exceeds reasonable bound", async () => {
      const modules = TEMPLATE_NAMES.map((name) => ({ template: name }));
      const result = await executeCreateRack({ modules });
      const yCoords = extractYCoords(result);

      // With local auto-layout (50 + j * 40), the tallest single template
      // has ~40 nodes → max Y ≈ 50 + 39*40 = 1610. Add generous margin.
      const MAX_REASONABLE_Y = 2000;
      const violators = yCoords.filter((y) => y > MAX_REASONABLE_Y);
      expect(violators).toEqual([]);
    });

    it("reverb module nodes have bounded Y in multi-module rack", async () => {
      // This is the exact bug: reverb internal nodes had y=2730+ because
      // auto-layout used global index instead of local index.
      const result = await executeCreateRack({
        modules: [
          { template: "clock", params: { bpm: 120 } },
          { template: "sequencer", params: { steps: 8 } },
          { template: "synth" },
          { template: "reverb" },
          { template: "mixer", params: { channels: 2 } },
        ],
      });
      const yCoords = extractYCoords(result);
      const maxY = Math.max(...yCoords);

      // Before fix: maxY was 3010 (reverb dac~ at global index 74)
      // After fix: should be well under 1500
      expect(maxY).toBeLessThan(1500);
    });

    it("nodes without explicit Y get local auto-layout per module", async () => {
      // Reverb module's internal nodes (from compose system) lack explicit Y.
      // They should be laid out starting from y=50 relative to their module,
      // not pushed down by preceding modules' node count.
      const result = await executeCreateRack({
        modules: [
          { template: "synth" },          // ~15 nodes with explicit Y
          { template: "synth" },          // ~15 more
          { template: "reverb" },         // has 4 nodes without Y
        ],
      });
      const yCoords = extractYCoords(result);

      // With 3 modules of ~15+15+10 nodes, all Ys should be compact
      for (const y of yCoords) {
        expect(y).toBeLessThan(1000);
      }
    });
  });
});
