import { describe, it, expect } from "vitest";
import { oscillator } from "../../src/templates/modules/oscillator.js";
import { filter } from "../../src/templates/modules/filter.js";
import { vca } from "../../src/templates/modules/vca.js";
import { envelope } from "../../src/templates/modules/envelope.js";
import { delay } from "../../src/templates/modules/delay.js";
import { reverb } from "../../src/templates/modules/reverb.js";

describe("oscillator module", () => {
  it("sine: single osc~ node", () => {
    const mod = oscillator("sine", 440);
    expect(mod.nodes.length).toBe(1);
    expect(mod.nodes[0].name).toBe("osc~");
    expect(mod.inlets).toEqual([0]);
    expect(mod.outlets).toEqual([0]);
  });

  it("saw: single phasor~ node", () => {
    const mod = oscillator("saw", 220);
    expect(mod.nodes.length).toBe(1);
    expect(mod.nodes[0].name).toBe("phasor~");
    expect(mod.nodes[0].args).toEqual([220]);
  });

  it("square: 4 nodes (phasor~ → >~ → *~ → -~)", () => {
    const mod = oscillator("square", 440);
    expect(mod.nodes.length).toBe(4);
    expect(mod.nodes[0].name).toBe("phasor~");
    expect(mod.nodes[1].name).toBe(">~");
    expect(mod.nodes[2].name).toBe("*~");
    expect(mod.nodes[3].name).toBe("-~");
    expect(mod.connections.length).toBe(3);
    expect(mod.inlets).toEqual([0]);
    expect(mod.outlets).toEqual([3]);
  });

  it("noise: single noise~ node, no inlets", () => {
    const mod = oscillator("noise");
    expect(mod.nodes.length).toBe(1);
    expect(mod.nodes[0].name).toBe("noise~");
    expect(mod.inlets).toEqual([]);
    expect(mod.outlets).toEqual([0]);
  });
});

describe("filter module", () => {
  it("lowpass: single lop~ node", () => {
    const mod = filter("lowpass", 1000);
    expect(mod.nodes.length).toBe(1);
    expect(mod.nodes[0].name).toBe("lop~");
    expect(mod.nodes[0].args).toEqual([1000]);
  });

  it("highpass: single hip~ node", () => {
    const mod = filter("highpass", 500);
    expect(mod.nodes[0].name).toBe("hip~");
  });

  it("bandpass: single bp~ node", () => {
    const mod = filter("bandpass", 800);
    expect(mod.nodes[0].name).toBe("bp~");
  });

  it("moog: single bob~ node", () => {
    const mod = filter("moog", 1200);
    expect(mod.nodes[0].name).toBe("bob~");
    expect(mod.nodes[0].args![0]).toBe(1200);
  });

  it("korg: hip~ → lop~ (2 nodes), cutoff ratio applied", () => {
    const mod = filter("korg", 1000);
    expect(mod.nodes.length).toBe(2);
    expect(mod.nodes[0].name).toBe("hip~");
    expect(mod.nodes[0].args).toEqual([100]); // 1000 * 0.1
    expect(mod.nodes[1].name).toBe("lop~");
    expect(mod.nodes[1].args).toEqual([1000]);
    expect(mod.connections.length).toBe(1);
    expect(mod.inlets).toEqual([0]);
    expect(mod.outlets).toEqual([1]);
  });
});

describe("vca module", () => {
  it("single *~ node with gain", () => {
    const mod = vca(0.5);
    expect(mod.nodes.length).toBe(1);
    expect(mod.nodes[0].name).toBe("*~");
    expect(mod.nodes[0].args).toEqual([0.5]);
    expect(mod.inlets).toEqual([0]);
    expect(mod.outlets).toEqual([0]);
  });
});

describe("envelope module", () => {
  it("adsr: msg + line~ (2 nodes) with multi-segment message", () => {
    const mod = envelope("adsr", { attack: 10, decay: 100, sustain: 0.7, release: 200 });
    expect(mod.nodes.length).toBe(2);
    expect(mod.nodes[0].type).toBe("msg");
    expect(mod.nodes[1].name).toBe("line~");
    // Check message contains escaped commas
    const args = mod.nodes[0].args!;
    expect(args).toContain("\\,");
    expect(args[0]).toBe(0); // reset
    expect(mod.connections.length).toBe(1);
    expect(mod.inlets).toEqual([0]);
    expect(mod.outlets).toEqual([1]);
  });

  it("ar: msg + line~ (2 nodes)", () => {
    const mod = envelope("ar", { attack: 5, release: 300 });
    expect(mod.nodes.length).toBe(2);
    expect(mod.nodes[0].type).toBe("msg");
  });

  it("decay: msg + line~ (2 nodes)", () => {
    const mod = envelope("decay", { decay: 500 });
    expect(mod.nodes.length).toBe(2);
  });
});

describe("delay module", () => {
  it("simple: 4 nodes with unique id", () => {
    const mod = delay("simple", { timeMs: 300, feedback: 0.5, id: "dly1" });
    expect(mod.nodes.length).toBe(4);
    expect(mod.nodes[1].name).toBe("delwrite~");
    expect(mod.nodes[1].args).toEqual(["dly1", 300]);
    expect(mod.nodes[2].name).toBe("delread~");
    expect(mod.nodes[2].args).toEqual(["dly1", 300]);
    expect(mod.connections.length).toBe(3);
  });

  it("pingpong: 8 nodes with L/R ids", () => {
    const mod = delay("pingpong", { id: "pp" });
    expect(mod.nodes.length).toBe(8);
    expect(mod.nodes[1].args![0]).toBe("pp_L");
    expect(mod.nodes[5].args![0]).toBe("pp_R");
    expect(mod.inlets.length).toBe(2);
    expect(mod.outlets.length).toBe(2);
  });
});

describe("reverb module", () => {
  it("simple: 4 nodes", () => {
    const mod = reverb("simple", { id: "rv" });
    expect(mod.nodes.length).toBe(4);
    expect(mod.nodes[1].name).toBe("delwrite~");
    expect(mod.nodes[1].args![0]).toBe("rv");
  });

  it("schroeder: 15 nodes with unique prefixed names", () => {
    const mod = reverb("schroeder", { roomSize: 0.5, damping: 0.5, id: "sr" });
    expect(mod.nodes.length).toBe(15);
    // Comb 1 delwrite
    expect(mod.nodes[1].args![0]).toBe("sr_c1");
    // Comb 2 delwrite
    expect(mod.nodes[6].args![0]).toBe("sr_c2");
    // Allpass delwrite
    expect(mod.nodes[11].args![0]).toBe("sr_ap");
    expect(mod.outlets).toEqual([14]);
  });
});
