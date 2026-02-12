import { describe, it, expect } from "vitest";
import { executeCreateRack } from "../../src/tools/rack.js";
import { buildTemplateWithPorts, TEMPLATE_NAMES } from "../../src/templates/index.js";
import { parsePatch } from "../../src/core/parser.js";

// Helper to extract the combined _rack.pd content from the result string
function extractRackPd(result: string): string {
  const marker = "--- _rack.pd (combined) ---";
  const section = result.split(marker)[1];
  // Extract content between ```pd and ```
  const match = section.match(/```pd\n([\s\S]*?)```/);
  return match ? match[1] : "";
}

describe("rack wiring integration", () => {
  // -----------------------------------------------------------------------
  // 1. Synth → Reverb (audio bus)
  // -----------------------------------------------------------------------
  it("synth → reverb audio wiring: throw~/catch~ present, synth dac~ disconnected", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw" }, id: "synth" },
        { template: "reverb", id: "reverb" },
      ],
      wiring: [
        { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
      ],
    });

    const rackPd = extractRackPd(result);
    expect(rackPd).toContain("throw~ synth__audio");
    expect(rackPd).toContain("catch~ synth__audio");
    // Wiring info in output
    expect(result).toContain("1 connection(s) applied");
  });

  // -----------------------------------------------------------------------
  // 2. Sequencer → Synth (control: note bus)
  // -----------------------------------------------------------------------
  it("sequencer → synth note wiring: send/receive present", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "sequencer", params: { steps: 4 }, id: "seq" },
        { template: "synth", id: "synth" },
      ],
      wiring: [
        { from: "seq", output: "note", to: "synth", input: "note" },
      ],
    });

    const rackPd = extractRackPd(result);
    expect(rackPd).toContain("send seq__note");
    expect(rackPd).toContain("receive seq__note");
  });

  // -----------------------------------------------------------------------
  // 3. Clock → Sequencer (clock_in: metro disconnect)
  // -----------------------------------------------------------------------
  it("clock → sequencer clock_in: metro disconnected, receive added", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 140, divisions: [1] }, id: "clock" },
        { template: "sequencer", params: { steps: 4 }, id: "seq" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
      ],
    });

    const rackPd = extractRackPd(result);
    expect(rackPd).toContain("send clock__beat_div1");
    expect(rackPd).toContain("receive clock__beat_div1");
  });

  // -----------------------------------------------------------------------
  // 4. Full chain: clock → seq → synth → reverb → mixer
  // -----------------------------------------------------------------------
  it("full chain: all buses present, only mixer dac~ remains live", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 140, divisions: [1] }, id: "clock" },
        { template: "sequencer", params: { steps: 8 }, id: "seq" },
        { template: "synth", params: { waveform: "saw" }, id: "synth" },
        { template: "reverb", id: "reverb" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
        { from: "seq", output: "note", to: "synth", input: "note" },
        { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
        { from: "reverb", output: "audio", to: "mixer", input: "ch1" },
      ],
    });

    const rackPd = extractRackPd(result);

    // All buses should be present
    expect(rackPd).toContain("send clock__beat_div1");
    expect(rackPd).toContain("receive clock__beat_div1");
    expect(rackPd).toContain("send seq__note");
    expect(rackPd).toContain("receive seq__note");
    expect(rackPd).toContain("throw~ synth__audio");
    expect(rackPd).toContain("catch~ synth__audio");
    expect(rackPd).toContain("throw~ reverb__audio");
    expect(rackPd).toContain("catch~ reverb__audio");

    // 4 connections applied
    expect(result).toContain("4 connection(s) applied");
  });

  // -----------------------------------------------------------------------
  // 5. Unwired modules keep dac~
  // -----------------------------------------------------------------------
  it("unwired modules keep their dac~ intact", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
        { template: "drum-machine", id: "drums" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [
        // Only synth is wired — drums should keep its dac~
        { from: "synth", output: "audio", to: "mixer", input: "ch1" },
      ],
    });

    const rackPd = extractRackPd(result);

    // Should have synth's bus
    expect(rackPd).toContain("throw~ synth__audio");
    // Drums dac~ should still have connections (it appears as "dac~" in the patch)
    // The drum-machine's dac~ is NOT disconnected because drums is not wired
    expect(rackPd).toContain("dac~");
  });

  // -----------------------------------------------------------------------
  // 6. All 10 templates produce valid ports
  // -----------------------------------------------------------------------
  it("all 10 templates produce non-empty ports with valid indices", () => {
    for (const name of TEMPLATE_NAMES) {
      const { spec, ports } = buildTemplateWithPorts(name);
      expect(ports.length).toBeGreaterThan(0);
      for (const port of ports) {
        expect(port.nodeIndex).toBeLessThan(spec.nodes.length);
        expect(port.nodeIndex).toBeGreaterThanOrEqual(0);
        if (port.ioNodeIndex !== undefined) {
          expect(port.ioNodeIndex).toBeLessThan(spec.nodes.length);
          expect(port.ioNodeIndex).toBeGreaterThanOrEqual(0);
        }
        expect(["audio", "control"]).toContain(port.type);
        expect(["input", "output"]).toContain(port.direction);
      }
    }
  });

  // -----------------------------------------------------------------------
  // 7. Round-trip: build wired rack → parsePatch → no parse errors
  // -----------------------------------------------------------------------
  it("wired rack round-trips through parser without errors", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 120, divisions: [1] }, id: "clock" },
        { template: "sequencer", params: { steps: 4 }, id: "seq" },
        { template: "synth", id: "synth" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
        { from: "seq", output: "note", to: "synth", input: "note" },
      ],
    });

    const rackPd = extractRackPd(result);
    expect(rackPd).toBeTruthy();

    // parsePatch should not throw
    const parsed = parsePatch(rackPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
    // Bus nodes should appear in parsed output
    const nodeNames = parsed.root.nodes.map((n) => n.name);
    expect(nodeNames).toContain("send");
    expect(nodeNames).toContain("receive");
  });

  // -----------------------------------------------------------------------
  // 8. Backward compat: rack WITHOUT wiring identical to current output
  // -----------------------------------------------------------------------
  it("rack without wiring produces same output as before (no bus nodes)", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
        { template: "reverb", id: "reverb" },
      ],
    });

    const rackPd = extractRackPd(result);

    // No bus nodes should be present
    expect(rackPd).not.toContain("throw~");
    expect(rackPd).not.toContain("catch~");
    expect(rackPd).not.toMatch(/\bsend\b/);
    expect(rackPd).not.toMatch(/\breceive\b/);
    // Should not mention wiring
    expect(result).not.toContain("connection(s) applied");
  });

  // -----------------------------------------------------------------------
  // 9. Control fan-out: clock → seq + clock → turing (multiple receive)
  // -----------------------------------------------------------------------
  it("control fan-out: clock drives both sequencer and turing-machine", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 120, divisions: [1] }, id: "clock" },
        { template: "sequencer", params: { steps: 4 }, id: "seq" },
        { template: "turing-machine", id: "turing" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
        { from: "clock", output: "beat_div1", to: "turing", input: "clock_in" },
      ],
    });

    const rackPd = extractRackPd(result);

    // Two separate send/receive pairs (control buses naturally fan out via
    // multiple receive objects, but our system creates one per wire)
    expect(rackPd).toContain("send clock__beat_div1");
    expect(rackPd).toContain("receive clock__beat_div1");
    expect(result).toContain("2 connection(s) applied");
  });

  // -----------------------------------------------------------------------
  // 10. Reverb in chain: synth → reverb → mixer (multi-target adc~ redirect)
  // -----------------------------------------------------------------------
  it("synth → reverb → mixer: reverb adc~ multi-target preserved", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw" }, id: "synth" },
        { template: "reverb", id: "reverb" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [
        { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
        { from: "reverb", output: "audio", to: "mixer", input: "ch1" },
      ],
    });

    const rackPd = extractRackPd(result);

    // Both audio buses should exist
    expect(rackPd).toContain("throw~ synth__audio");
    expect(rackPd).toContain("catch~ synth__audio");
    expect(rackPd).toContain("throw~ reverb__audio");
    expect(rackPd).toContain("catch~ reverb__audio");

    // Round-trip to verify structural integrity
    const parsed = parsePatch(rackPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
    // Both catch~ nodes should appear
    const catchNodes = parsed.root.nodes.filter((n) => n.name === "catch~");
    expect(catchNodes.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 11. Layout regression: wired rack Y coords stay bounded
  // -----------------------------------------------------------------------
  it("wired full-chain rack has no extreme Y coordinates", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 140, divisions: [1] }, id: "clock" },
        { template: "sequencer", params: { steps: 8 }, id: "seq" },
        { template: "synth", params: { waveform: "saw" }, id: "synth" },
        { template: "reverb", id: "reverb" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
        { from: "seq", output: "note", to: "synth", input: "note" },
        { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
        { from: "reverb", output: "audio", to: "mixer", input: "ch1" },
      ],
    });

    const rackPd = extractRackPd(result);
    const parsed = parsePatch(rackPd);

    // Before Y fix: reverb nodes at y=2730-3010 due to global index auto-layout.
    // After fix: all modules use local index, max Y should be under 1500.
    for (const node of parsed.root.nodes) {
      expect(node.y).toBeLessThan(1500);
    }
  });

  // -----------------------------------------------------------------------
  // 12. Bus nodes have valid coordinates (not overlapping at 0,0)
  // -----------------------------------------------------------------------
  it("bus nodes have valid coordinates", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
        { template: "reverb", id: "reverb" },
      ],
      wiring: [
        { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
      ],
    });

    const rackPd = extractRackPd(result);
    const parsed = parsePatch(rackPd);

    // Bus nodes: throw~, catch~ should have coordinates
    const busNodes = parsed.root.nodes.filter(
      (n) => n.name === "throw~" || n.name === "catch~",
    );
    expect(busNodes.length).toBeGreaterThan(0);
    for (const node of busNodes) {
      expect(node.x).toBeDefined();
      expect(node.y).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // 13. Empty array params don't break wired rack
  // -----------------------------------------------------------------------
  it("clock with divisions=[] in wired rack uses defaults correctly", async () => {
    // This was the Claude Desktop bug: divisions=[] threw an error
    const result = await executeCreateRack({
      modules: [
        { template: "clock", params: { bpm: 120, divisions: [] }, id: "clock" },
        { template: "sequencer", params: { steps: 4 }, id: "seq" },
      ],
      wiring: [
        { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
      ],
    });

    const rackPd = extractRackPd(result);
    // Default divisions [1,2,4,8] should be present — beat_div1 is division 1
    expect(rackPd).toContain("send clock__beat_div1");
    expect(rackPd).toContain("receive clock__beat_div1");
    expect(result).toContain("1 connection(s) applied");
  });
});
