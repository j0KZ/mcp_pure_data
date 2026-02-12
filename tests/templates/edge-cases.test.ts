/**
 * Edge-case tests for template parameter validation and boundary values.
 */
import { describe, it, expect } from "vitest";
import { buildPatch } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
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

// ──────────────────────────────────────────────
// Boolean coercion (Claude may pass true/false)
// ──────────────────────────────────────────────

describe("boolean coercion for enum params", () => {
  it("coerces envelope: true → adsr", () => {
    const spec = buildSynth({ envelope: true as any });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("vline~"); // ADSR uses vline~ (sample-accurate)
  });

  it("coerces envelope: false → none", () => {
    const spec = buildSynth({ envelope: false as any });
    const pd = buildPatch(spec.spec);
    expect(pd).not.toContain("vline~");
  });

  it("coerces waveform: true → sine", () => {
    const spec = buildSynth({ waveform: true as any });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("osc~");
  });

  it("coerces filter: true → lowpass", () => {
    const spec = buildSynth({ filter: true as any });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("lop~");
  });

  it("coerces reverb variant: true → schroeder", () => {
    const spec = buildReverb({ variant: true as any });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("delwrite~");
  });
});

// ──────────────────────────────────────────────
// Synth validation
// ──────────────────────────────────────────────

describe("synth param validation", () => {
  it("rejects invalid waveform", () => {
    expect(() => buildSynth({ waveform: "triangle" as any })).toThrow(/Invalid waveform/);
  });

  it("rejects invalid filter", () => {
    expect(() => buildSynth({ filter: "butterworth" as any })).toThrow(/Invalid filter/);
  });

  it("rejects invalid envelope", () => {
    expect(() => buildSynth({ envelope: "pluck" as any })).toThrow(/Invalid envelope/);
  });

  it("rejects negative frequency", () => {
    expect(() => buildSynth({ frequency: -100 })).toThrow(/frequency must be a positive/);
  });

  it("rejects zero frequency", () => {
    expect(() => buildSynth({ frequency: 0 })).toThrow(/frequency must be a positive/);
  });

  it("rejects NaN frequency", () => {
    expect(() => buildSynth({ frequency: NaN })).toThrow(/frequency must be a positive/);
  });

  it("rejects negative cutoff", () => {
    expect(() => buildSynth({ cutoff: -1 })).toThrow(/cutoff must be a positive/);
  });

  it("rejects amplitude > 1", () => {
    expect(() => buildSynth({ amplitude: 1.5 })).toThrow(/amplitude must be 0-1/);
  });

  it("rejects negative amplitude", () => {
    expect(() => buildSynth({ amplitude: -0.1 })).toThrow(/amplitude must be 0-1/);
  });

  it("accepts boundary amplitude 0", () => {
    const spec = buildSynth({ amplitude: 0 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");
  });

  it("accepts boundary amplitude 1", () => {
    const spec = buildSynth({ amplitude: 1 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");
  });

  it("accepts noise waveform (no frequency input)", () => {
    const spec = buildSynth({ waveform: "noise" });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("noise~");
  });

  it("builds all waveform + filter combinations without error", () => {
    const waveforms = ["sine", "saw", "square", "noise"] as const;
    const filters = ["lowpass", "highpass", "bandpass", "moog", "korg"] as const;
    for (const waveform of waveforms) {
      for (const filter of filters) {
        const spec = buildSynth({ waveform, filter });
        const pd = buildPatch(spec.spec);
        expect(pd).toContain("#N canvas");
      }
    }
  });

  it("builds all envelope variants", () => {
    const envelopes = ["adsr", "ar", "decay", "none"] as const;
    for (const envelope of envelopes) {
      const spec = buildSynth({ envelope });
      const pd = buildPatch(spec.spec);
      expect(pd).toContain("#N canvas");
    }
  });
});

// ──────────────────────────────────────────────
// Sequencer validation
// ──────────────────────────────────────────────

describe("sequencer param validation", () => {
  it("rejects steps = 0", () => {
    expect(() => buildSequencer({ steps: 0 })).toThrow(/steps must be 1-64/);
  });

  it("rejects steps > 64", () => {
    expect(() => buildSequencer({ steps: 65 })).toThrow(/steps must be 1-64/);
  });

  it("rejects negative bpm", () => {
    expect(() => buildSequencer({ bpm: -10 })).toThrow(/bpm must be a positive/);
  });

  it("rejects zero bpm", () => {
    expect(() => buildSequencer({ bpm: 0 })).toThrow(/bpm must be a positive/);
  });

  it("coerces empty notes array to default (no throw)", () => {
    // Empty arrays are coerced to undefined → builder uses default notes
    expect(() => buildSequencer({ notes: [] })).not.toThrow();
  });

  it("rejects MIDI note > 127", () => {
    expect(() => buildSequencer({ notes: [60, 128] })).toThrow(/MIDI note must be 0-127/);
  });

  it("rejects negative MIDI note", () => {
    expect(() => buildSequencer({ notes: [-1, 60] })).toThrow(/MIDI note must be 0-127/);
  });

  it("rejects midiChannel 0", () => {
    expect(() => buildSequencer({ midiChannel: 0 })).toThrow(/midiChannel must be 1-16/);
  });

  it("rejects midiChannel 17", () => {
    expect(() => buildSequencer({ midiChannel: 17 })).toThrow(/midiChannel must be 1-16/);
  });

  it("rejects velocity > 127", () => {
    expect(() => buildSequencer({ velocity: 200 })).toThrow(/velocity must be 0-127/);
  });

  it("builds with 1 step (minimum)", () => {
    const spec = buildSequencer({ steps: 1, notes: [60] });
    const pd = buildPatch(spec.spec);
    const parsed = parsePatch(pd);
    expect(parsed.root.nodes.some((n) => n.name === "select")).toBe(true);
  });

  it("builds with cyclic note padding (fewer notes than steps)", () => {
    const spec = buildSequencer({ steps: 6, notes: [60, 72] });
    const pd = buildPatch(spec.spec);
    // Notes should be padded: [60, 72, 60, 72, 60, 72]
    const parsed = parsePatch(pd);
    const msgNodes = parsed.root.nodes.filter((n) => n.type === "msg");
    // 1 msg for "start" + 6 note msgs
    expect(msgNodes.length).toBe(7);
  });

  it("builds with boundary MIDI notes (0 and 127)", () => {
    const spec = buildSequencer({ steps: 2, notes: [0, 127] });
    const pd = buildPatch(spec.spec);
    expect(pd).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Reverb validation
// ──────────────────────────────────────────────

describe("reverb param validation", () => {
  it("rejects invalid variant", () => {
    expect(() => buildReverb({ variant: "hall" as any })).toThrow(/Invalid reverb variant/);
  });

  it("rejects roomSize > 1", () => {
    expect(() => buildReverb({ roomSize: 1.5 })).toThrow(/roomSize must be 0-1/);
  });

  it("rejects negative roomSize", () => {
    expect(() => buildReverb({ roomSize: -0.1 })).toThrow(/roomSize must be 0-1/);
  });

  it("rejects damping > 1", () => {
    expect(() => buildReverb({ damping: 2 })).toThrow(/damping must be 0-1/);
  });

  it("rejects wetDry > 1", () => {
    expect(() => buildReverb({ wetDry: 1.1 })).toThrow(/wetDry must be 0-1/);
  });

  it("accepts boundary values (0 and 1)", () => {
    const spec = buildReverb({ roomSize: 0, damping: 0, wetDry: 0 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");

    const spec2 = buildReverb({ roomSize: 1, damping: 1, wetDry: 1 });
    expect(buildPatch(spec2.spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Mixer validation
// ──────────────────────────────────────────────

describe("mixer param validation", () => {
  it("rejects channels = 0", () => {
    expect(() => buildMixer({ channels: 0 })).toThrow(/channels must be 1-16/);
  });

  it("rejects channels > 16", () => {
    expect(() => buildMixer({ channels: 17 })).toThrow(/channels must be 1-16/);
  });

  it("rejects negative channels", () => {
    expect(() => buildMixer({ channels: -1 })).toThrow(/channels must be 1-16/);
  });

  it("builds with max channels (16)", () => {
    const spec = buildMixer({ channels: 16 });
    const pd = buildPatch(spec.spec);
    const parsed = parsePatch(pd);
    const inlets = parsed.root.nodes.filter((n) => n.name === "inlet~");
    expect(inlets.length).toBe(16);
  });

  it("builds 2-channel mixer correctly (single +~)", () => {
    const spec = buildMixer({ channels: 2 });
    const pd = buildPatch(spec.spec);
    const parsed = parsePatch(pd);
    const plusNodes = parsed.root.nodes.filter((n) => n.name === "+~");
    expect(plusNodes.length).toBe(1); // 2 channels → 1 summing node
  });
});

// ──────────────────────────────────────────────
// Drum Machine validation
// ──────────────────────────────────────────────

describe("drum-machine param validation", () => {
  it("rejects invalid voice type", () => {
    expect(() => buildDrumMachine({ voices: ["kick" as any] })).toThrow(/Invalid drum voice/);
  });

  it("coerces empty voices array to default (no throw)", () => {
    // Empty arrays are coerced to undefined → builder uses default voices
    expect(() => buildDrumMachine({ voices: [] })).not.toThrow();
  });

  it("rejects tune > 1", () => {
    expect(() => buildDrumMachine({ tune: 1.5 })).toThrow(/tune must be 0-1/);
  });

  it("rejects negative tune", () => {
    expect(() => buildDrumMachine({ tune: -0.1 })).toThrow(/tune must be 0-1/);
  });

  it("rejects decay > 1", () => {
    expect(() => buildDrumMachine({ decay: 2 })).toThrow(/decay must be 0-1/);
  });

  it("rejects tone > 1", () => {
    expect(() => buildDrumMachine({ tone: 1.1 })).toThrow(/tone must be 0-1/);
  });

  it("rejects amplitude > 1", () => {
    expect(() => buildDrumMachine({ amplitude: 1.5 })).toThrow(/amplitude must be 0-1/);
  });

  it("accepts boundary values (0 and 1)", () => {
    const spec = buildDrumMachine({ tune: 0, decay: 0, tone: 0, amplitude: 0 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");

    const spec2 = buildDrumMachine({ tune: 1, decay: 1, tone: 1, amplitude: 1 });
    expect(buildPatch(spec2.spec)).toContain("#N canvas");
  });

  it("builds all voice types individually", () => {
    for (const voice of ["bd", "sn", "hh", "cp"] as const) {
      const spec = buildDrumMachine({ voices: [voice] });
      expect(buildPatch(spec.spec)).toContain("#N canvas");
    }
  });
});

// ──────────────────────────────────────────────
// Clock validation
// ──────────────────────────────────────────────

describe("clock param validation", () => {
  it("rejects negative bpm", () => {
    expect(() => buildClock({ bpm: -10 })).toThrow(/bpm must be a positive/);
  });

  it("rejects zero bpm", () => {
    expect(() => buildClock({ bpm: 0 })).toThrow(/bpm must be a positive/);
  });

  it("coerces empty divisions array to default (no throw)", () => {
    // Empty arrays are coerced to undefined → builder uses default [1, 2, 4, 8]
    expect(() => buildClock({ divisions: [] })).not.toThrow();
  });

  it("rejects division = 0", () => {
    expect(() => buildClock({ divisions: [0] })).toThrow(/Each division must be an integer 1-64/);
  });

  it("rejects division > 64", () => {
    expect(() => buildClock({ divisions: [65] })).toThrow(/Each division must be an integer 1-64/);
  });

  it("accepts boundary divisions (1 and 64)", () => {
    const spec = buildClock({ divisions: [1, 64] });
    expect(buildPatch(spec.spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Chaos validation
// ──────────────────────────────────────────────

describe("chaos param validation", () => {
  it("rejects outputs = 0", () => {
    expect(() => buildChaos({ outputs: 0 })).toThrow(/outputs must be 1-3/);
  });

  it("rejects outputs > 3", () => {
    expect(() => buildChaos({ outputs: 4 })).toThrow(/outputs must be 1-3/);
  });

  it("rejects speed > 1", () => {
    expect(() => buildChaos({ speed: 1.5 })).toThrow(/speed must be 0-1/);
  });

  it("rejects negative speed", () => {
    expect(() => buildChaos({ speed: -0.1 })).toThrow(/speed must be 0-1/);
  });

  it("rejects r < 3.5", () => {
    expect(() => buildChaos({ r: 3.0 })).toThrow(/r must be 3.5-4.0/);
  });

  it("rejects r > 4.0", () => {
    expect(() => buildChaos({ r: 4.1 })).toThrow(/r must be 3.5-4.0/);
  });

  it("accepts boundary values", () => {
    const spec = buildChaos({ outputs: 1, speed: 0, r: 3.5 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");

    const spec2 = buildChaos({ outputs: 3, speed: 1, r: 4.0 });
    expect(buildPatch(spec2.spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Maths validation
// ──────────────────────────────────────────────

describe("maths param validation", () => {
  it("rejects channels = 0", () => {
    expect(() => buildMaths({ channels: 0 })).toThrow(/channels must be 1-2/);
  });

  it("rejects channels > 2", () => {
    expect(() => buildMaths({ channels: 3 })).toThrow(/channels must be 1-2/);
  });

  it("rejects negative rise", () => {
    expect(() => buildMaths({ rise: -10 })).toThrow(/rise must be a positive/);
  });

  it("rejects zero rise", () => {
    expect(() => buildMaths({ rise: 0 })).toThrow(/rise must be a positive/);
  });

  it("rejects negative fall", () => {
    expect(() => buildMaths({ fall: -5 })).toThrow(/fall must be a positive/);
  });

  it("rejects invalid outputRange", () => {
    expect(() => buildMaths({ outputRange: "log" as any })).toThrow(/Invalid outputRange/);
  });

  it("coerces outputRange: true → bipolar", () => {
    const spec = buildMaths({ outputRange: true as any });
    const pd = buildPatch(spec.spec);
    // Bipolar mode uses -~ (subtraction)
    expect(pd).toContain("-~");
  });

  it("accepts boundary channels (1 and 2)", () => {
    expect(buildPatch(buildMaths({ channels: 1 }).spec)).toContain("#N canvas");
    expect(buildPatch(buildMaths({ channels: 2 }).spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Turing Machine validation
// ──────────────────────────────────────────────

describe("turing-machine param validation", () => {
  it("rejects length = 1", () => {
    expect(() => buildTuringMachine({ length: 1 })).toThrow(/length must be 2-16/);
  });

  it("rejects length > 16", () => {
    expect(() => buildTuringMachine({ length: 17 })).toThrow(/length must be 2-16/);
  });

  it("rejects probability > 1", () => {
    expect(() => buildTuringMachine({ probability: 1.5 })).toThrow(/probability must be 0-1/);
  });

  it("rejects negative probability", () => {
    expect(() => buildTuringMachine({ probability: -0.1 })).toThrow(/probability must be 0-1/);
  });

  it("rejects negative bpm", () => {
    expect(() => buildTuringMachine({ bpm: -10 })).toThrow(/bpm must be a positive/);
  });

  it("rejects range = 0", () => {
    expect(() => buildTuringMachine({ range: 0 })).toThrow(/range must be 1-127/);
  });

  it("rejects range > 127", () => {
    expect(() => buildTuringMachine({ range: 128 })).toThrow(/range must be 1-127/);
  });

  it("rejects negative offset", () => {
    expect(() => buildTuringMachine({ offset: -1 })).toThrow(/offset must be 0-127/);
  });

  it("rejects offset > 127", () => {
    expect(() => buildTuringMachine({ offset: 128 })).toThrow(/offset must be 0-127/);
  });

  it("accepts boundary values", () => {
    const spec = buildTuringMachine({ length: 2, probability: 0, range: 1, offset: 0 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");

    const spec2 = buildTuringMachine({ length: 16, probability: 1, range: 127, offset: 127 });
    expect(buildPatch(spec2.spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Granular validation
// ──────────────────────────────────────────────

describe("granular param validation", () => {
  it("rejects grains = 0", () => {
    expect(() => buildGranular({ grains: 0 })).toThrow(/grains must be 1-4/);
  });

  it("rejects grains > 4", () => {
    expect(() => buildGranular({ grains: 5 })).toThrow(/grains must be 1-4/);
  });

  it("rejects grainSize < 10", () => {
    expect(() => buildGranular({ grainSize: 5 })).toThrow(/grainSize must be 10-500/);
  });

  it("rejects grainSize > 500", () => {
    expect(() => buildGranular({ grainSize: 600 })).toThrow(/grainSize must be 10-500/);
  });

  it("rejects pitch < 0.25", () => {
    expect(() => buildGranular({ pitch: 0.1 })).toThrow(/pitch must be 0.25-4.0/);
  });

  it("rejects pitch > 4.0", () => {
    expect(() => buildGranular({ pitch: 5.0 })).toThrow(/pitch must be 0.25-4.0/);
  });

  it("rejects position > 1", () => {
    expect(() => buildGranular({ position: 1.5 })).toThrow(/position must be 0-1/);
  });

  it("rejects wetDry > 1", () => {
    expect(() => buildGranular({ wetDry: 1.1 })).toThrow(/wetDry must be 0-1/);
  });

  it("accepts boundary values", () => {
    const spec = buildGranular({ grains: 1, grainSize: 10, pitch: 0.25, position: 0, wetDry: 0 });
    expect(buildPatch(spec.spec)).toContain("#N canvas");

    const spec2 = buildGranular({ grains: 4, grainSize: 500, pitch: 4.0, position: 1, wetDry: 1 });
    expect(buildPatch(spec2.spec)).toContain("#N canvas");
  });
});

// ──────────────────────────────────────────────
// Empty array coercion (Claude may pass [])
// ──────────────────────────────────────────────

describe("empty array coercion produces same output as defaults", () => {
  it("clock: divisions=[] produces same patch as divisions=undefined", () => {
    const defaultPd = buildPatch(buildClock({}).spec);
    const coercedPd = buildPatch(buildClock({ divisions: [] }).spec);
    expect(coercedPd).toEqual(defaultPd);
  });

  it("clock: divisions=[] results in 4 default divisions [1,2,4,8]", () => {
    const pd = buildPatch(buildClock({ divisions: [] }).spec);
    const parsed = parsePatch(pd);
    // Default divisions [1,2,4,8] → 4 "sel" nodes (one per division output)
    const selNodes = parsed.root.nodes.filter(
      (n) => n.name === "sel" && String(n.args?.[0]) === "0",
    );
    expect(selNodes.length).toBe(4);
  });

  it("sequencer: notes=[] produces same patch as notes=undefined", () => {
    const defaultPd = buildPatch(buildSequencer({ steps: 4 }).spec);
    const coercedPd = buildPatch(buildSequencer({ steps: 4, notes: [] }).spec);
    expect(coercedPd).toEqual(defaultPd);
  });

  it("sequencer: notes=[] results in C major scale defaults", () => {
    const pd = buildPatch(buildSequencer({ steps: 8, notes: [] }).spec);
    // Default notes: [60, 62, 64, 65, 67, 69, 71, 72]
    expect(pd).toContain("60");
    expect(pd).toContain("72");
  });

  it("drum-machine: voices=[] produces same patch as voices=undefined", () => {
    const defaultPd = buildPatch(buildDrumMachine({}).spec);
    const coercedPd = buildPatch(buildDrumMachine({ voices: [] }).spec);
    expect(coercedPd).toEqual(defaultPd);
  });

  it("drum-machine: voices=[] results in all 4 default voices", () => {
    const pd = buildPatch(buildDrumMachine({ voices: [] }).spec);
    const parsed = parsePatch(pd);
    // Default voices: ["bd", "sn", "hh", "cp"] — each has a trigger msg "bang"
    // The title text should list all voices
    const titleNode = parsed.root.nodes.find(
      (n) => n.type === "text" && n.raw?.includes("BD"),
    );
    expect(titleNode).toBeDefined();
    expect(titleNode!.raw).toContain("SN");
    expect(titleNode!.raw).toContain("HH");
    expect(titleNode!.raw).toContain("CP");
  });

  it("non-empty arrays still validated normally", () => {
    // Ensure coercion only applies to empty arrays, not invalid content
    expect(() => buildClock({ divisions: [0] })).toThrow(/1-64/);
    expect(() => buildSequencer({ notes: [200] })).toThrow(/0-127/);
    expect(() => buildDrumMachine({ voices: ["invalid" as any] })).toThrow(/Invalid drum voice/);
  });
});
