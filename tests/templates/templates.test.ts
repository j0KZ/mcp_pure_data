import { describe, it, expect } from "vitest";
import { buildPatch } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
import { buildTemplate, TEMPLATE_NAMES } from "../../src/templates/index.js";
import { buildSynth } from "../../src/templates/synth.js";
import { buildSequencer } from "../../src/templates/sequencer.js";
import { buildReverb } from "../../src/templates/reverb-template.js";
import { buildMixer } from "../../src/templates/mixer.js";
import { buildDrumMachine } from "../../src/templates/drum-machine.js";
import { buildClock } from "../../src/templates/clock.js";
import { buildChaos } from "../../src/templates/chaos.js";
import { buildMaths } from "../../src/templates/maths.js";
import { buildTuringMachine } from "../../src/templates/turing-machine.js";
import { buildGranular } from "../../src/templates/granular.js";

/** Round-trip helper: build → serialize → parse → verify structure. */
function roundTrip(rackable: ReturnType<typeof buildSynth>) {
  const pdText = buildPatch(rackable.spec);
  const parsed = parsePatch(pdText);
  return { pdText, parsed };
}

describe("synth template", () => {
  it("builds with defaults (saw + lowpass)", () => {
    const spec = buildSynth();
    const { parsed } = roundTrip(spec);

    expect(parsed.root.nodes.length).toBeGreaterThan(5);
    expect(parsed.root.connections.length).toBeGreaterThan(3);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("mtof");     // MIDI input
    expect(names).toContain("phasor~");  // saw oscillator
    expect(names).toContain("lop~");     // lowpass filter
    expect(names).toContain("loadbang"); // filter param init
    expect(names).toContain("dac~");
  });

  it("builds with square + moog + adsr envelope", () => {
    const spec = buildSynth({
      waveform: "square",
      filter: "moog",
      cutoff: 800,
      envelope: "adsr",
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("mtof");     // MIDI input
    expect(names).toContain("phasor~");  // square starts with phasor~
    expect(names).toContain(">~");       // square waveshaping
    expect(names).toContain("bob~");     // moog filter
    expect(names).toContain("sel");      // gate-based envelope trigger
    expect(names).toContain("vline~");   // sample-accurate envelope
    expect(names).toContain("dac~");
  });

  it("builds with korg filter", () => {
    const spec = buildSynth({ filter: "korg", cutoff: 2000 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("hip~");
    expect(names).toContain("lop~");
    expect(names).toContain("mtof");
    expect(names).toContain("loadbang");
  });
});

describe("sequencer template", () => {
  it("builds with defaults (8 steps, 120 BPM)", () => {
    const spec = buildSequencer();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    expect(names).toContain("select");
    expect(names).toContain("pack");
    expect(names).toContain("noteout");
  });

  it("builds with custom steps and notes (cyclic padding)", () => {
    const spec = buildSequencer({
      steps: 6,
      bpm: 140,
      notes: [60, 64, 67], // 3 notes, 6 steps → padded cyclically
    });
    const { parsed } = roundTrip(spec);

    // Should have 6 msg boxes for notes
    const msgNodes = parsed.root.nodes.filter((n) => n.type === "msg");
    expect(msgNodes.length).toBe(7); // 1 msg "1" (start) + 6 note msgs
  });

  it("builds with 4 steps and matches fixture structure", () => {
    const spec = buildSequencer({
      steps: 4,
      bpm: 120,
      notes: [60, 64, 67, 72],
    });
    const { parsed } = roundTrip(spec);

    // title, loadbang, msg(1), metro, float, +, mod, select, 4 note msgs, pack, noteout = 14
    expect(parsed.root.nodes.length).toBe(14);
    expect(parsed.root.connections.length).toBeGreaterThan(10);
  });
});

describe("reverb template", () => {
  it("builds simple reverb with defaults", () => {
    const spec = buildReverb({ variant: "simple" });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("adc~");
    expect(names).toContain("delwrite~");
    expect(names).toContain("delread~");
    expect(names).toContain("dac~");
  });

  it("builds schroeder reverb", () => {
    const spec = buildReverb({ variant: "schroeder", roomSize: 0.7 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("adc~");
    expect(names).toContain("dac~");
    // Should have multiple delwrite~/delread~ for combs + allpass
    const delwrites = names.filter((n) => n === "delwrite~");
    expect(delwrites.length).toBeGreaterThanOrEqual(3); // 2 combs + 1 allpass
  });
});

describe("mixer template", () => {
  it("builds 4-channel mixer", () => {
    const spec = buildMixer({ channels: 4 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    // 4 inlet~, 4 *~, 3 +~ (summing chain), 1 dac~
    const inlets = names.filter((n) => n === "inlet~");
    expect(inlets.length).toBe(4);
    expect(names).toContain("dac~");
  });

  it("builds 1-channel mixer (no summing)", () => {
    const spec = buildMixer({ channels: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names.filter((n) => n === "inlet~").length).toBe(1);
    expect(names).toContain("dac~");
    // No +~ needed for single channel
    expect(names.filter((n) => n === "+~").length).toBe(0);
  });

  it("builds 8-channel mixer", () => {
    const spec = buildMixer({ channels: 8 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names.filter((n) => n === "inlet~").length).toBe(8);
    // 7 +~ for summing 8 channels
    expect(names.filter((n) => n === "+~").length).toBe(7);
  });
});

// ──────────────────────────────────────────────
// Drum Machine
// ──────────────────────────────────────────────

describe("drum-machine template", () => {
  it("builds with defaults (4 voices)", () => {
    const spec = buildDrumMachine();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");       // BD oscillator
    expect(names).toContain("noise~");     // SN/HH/CP noise source
    expect(names).toContain("bp~");        // SN + CP bandpass
    expect(names).toContain("hip~");       // HH highpass
    expect(names).toContain("vline~");     // envelopes
    expect(names).toContain("dac~");
  });

  it("builds with custom voices (bd + hh only)", () => {
    const spec = buildDrumMachine({ voices: ["bd", "hh"] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");       // BD
    expect(names).toContain("hip~");       // HH
    // Should not contain bp~ (no SN or CP)
    expect(names).not.toContain("bp~");
    expect(names).toContain("dac~");
  });

  it("builds single voice (no summing chain)", () => {
    const spec = buildDrumMachine({ voices: ["bd"] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");
    expect(names).toContain("dac~");
    // Single voice → no +~ summing
    expect(names).not.toContain("+~");
  });

  it("builds with custom params", () => {
    const spec = buildDrumMachine({
      voices: ["bd", "sn", "hh", "cp"],
      tune: 0.8,
      decay: 0.3,
      tone: 0.7,
      amplitude: 0.5,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("dac~");
    expect(parsed.root.connections.length).toBeGreaterThan(10);
  });
});

// ──────────────────────────────────────────────
// Clock
// ──────────────────────────────────────────────

describe("clock template", () => {
  it("builds with defaults (120 BPM, 4 divisions)", () => {
    const spec = buildClock();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    // 4 divisions × sel + 1 master mod + counter mod
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(4);
  });

  it("builds with custom BPM and divisions", () => {
    const spec = buildClock({ bpm: 140, divisions: [1, 2, 8] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("metro");
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(3);
  });

  it("builds with single division", () => {
    const spec = buildClock({ divisions: [1] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("metro");
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Chaos
// ──────────────────────────────────────────────

describe("chaos template", () => {
  it("builds with defaults (3 outputs)", () => {
    const spec = buildChaos();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    // 3 channels → 3 metros
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(3);
    // Uses t (trigger) for computation
    expect(names).toContain("t");
  });

  it("builds with 1 output", () => {
    const spec = buildChaos({ outputs: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(1);
  });

  it("builds with custom r and speed", () => {
    const spec = buildChaos({ r: 3.7, speed: 0.8, outputs: 2 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(2);
  });
});

// ──────────────────────────────────────────────
// Maths
// ──────────────────────────────────────────────

describe("maths template", () => {
  it("builds with defaults (2 channels, unipolar)", () => {
    const spec = buildMaths();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("sel");       // gate → sel 1 0
    expect(names).toContain("vline~");    // envelope generator
    expect(names).toContain("threshold~"); // EOC detection
    expect(names).toContain("outlet~");   // output
    // 2 channels → 2 vline~ nodes
    const vlines = names.filter((n) => n === "vline~");
    expect(vlines.length).toBe(2);
  });

  it("builds with 1 channel", () => {
    const spec = buildMaths({ channels: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const vlines = names.filter((n) => n === "vline~");
    expect(vlines.length).toBe(1);
  });

  it("builds bipolar output", () => {
    const spec = buildMaths({ outputRange: "bipolar" });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    // Bipolar: *~ 2 → -~ 1
    expect(names).toContain("-~");
  });

  it("builds cycle mode (LFO)", () => {
    const spec = buildMaths({ cycle: true });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang"); // auto-start
    expect(names).toContain("delay");    // retrigger delay
  });

  it("builds non-cycle mode (no delay, no loadbang auto-start)", () => {
    const spec = buildMaths({ cycle: false });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).not.toContain("delay");
  });
});

// ──────────────────────────────────────────────
// Turing Machine
// ──────────────────────────────────────────────

describe("turing-machine template", () => {
  it("builds with defaults (8 steps)", () => {
    const spec = buildTuringMachine();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    expect(names).toContain("table");      // sequence storage
    expect(names).toContain("tabread");    // read from table
    expect(names).toContain("tabwrite");   // write mutations
    expect(names).toContain("random");     // probability check + new values
    expect(names).toContain("moses");      // probability threshold
    expect(names).toContain("t");          // trigger for split
  });

  it("builds with custom params", () => {
    const spec = buildTuringMachine({
      length: 12,
      probability: 0.3,
      bpm: 140,
      range: 36,
      offset: 36,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("table");
    expect(names).toContain("metro");
    expect(names).toContain("moses");
  });

  it("builds with probability=0 (locked loop)", () => {
    const spec = buildTuringMachine({ probability: 0 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("moses"); // moses 0 → never mutates
  });

  it("builds with probability=1 (pure random)", () => {
    const spec = buildTuringMachine({ probability: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("moses"); // moses 100 → always mutates
  });
});

// ──────────────────────────────────────────────
// Granular
// ──────────────────────────────────────────────

describe("granular template", () => {
  it("builds with defaults (2 grains)", () => {
    const spec = buildGranular();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("table");       // buffer
    expect(names).toContain("adc~");        // input
    expect(names).toContain("tabwrite~");   // recording
    expect(names).toContain("tabread4~");   // grain playback
    expect(names).toContain("phasor~");     // grain rate
    expect(names).toContain("clip~");       // grain envelope
    expect(names).toContain("spigot");      // record control
    expect(names).toContain("dac~");
    // 2 grains → 2 tabread4~
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(2);
  });

  it("builds with 4 grains", () => {
    const spec = buildGranular({ grains: 4 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(4);
  });

  it("builds with 1 grain (no summing)", () => {
    const spec = buildGranular({ grains: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(1);
  });

  it("builds with freeze=true (record=0)", () => {
    const spec = buildGranular({ freeze: true });
    const { pdText } = roundTrip(spec);

    // When freeze=true, the init message should send 0 (record off)
    // The msg box for loadbang init should contain 0
    expect(pdText).toContain("spigot");
  });

  it("builds with custom params", () => {
    const spec = buildGranular({
      grains: 3,
      grainSize: 200,
      pitch: 2.0,
      position: 0.3,
      wetDry: 0.8,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("dac~");
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(3);
  });
});

// ──────────────────────────────────────────────
// Template Registry
// ──────────────────────────────────────────────

describe("template registry", () => {
  it("lists all available templates", () => {
    expect(TEMPLATE_NAMES).toEqual([
      "synth",
      "sequencer",
      "reverb",
      "mixer",
      "drum-machine",
      "clock",
      "chaos",
      "maths",
      "turing-machine",
      "granular",
    ]);
  });

  it("builds each template with defaults without throwing", () => {
    for (const name of TEMPLATE_NAMES) {
      const spec = buildTemplate(name);
      const pdText = buildPatch(spec);
      expect(pdText).toContain("#N canvas");
    }
  });

  it("throws on unknown template", () => {
    expect(() => buildTemplate("nonexistent")).toThrow(/Unknown template/);
  });
});
