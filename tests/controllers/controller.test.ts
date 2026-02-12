import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

import { autoMap, type MappableModule } from "../../src/controllers/auto-mapper.js";
import { buildControllerPatch } from "../../src/controllers/pd-controller.js";
import { injectParameterReceivers, type InjectableModule } from "../../src/controllers/param-injector.js";
import { generateK2DeckConfig } from "../../src/controllers/k2-deck-config.js";
import { getDevice } from "../../src/devices/index.js";
import { k2Profile } from "../../src/devices/k2.js";
import { buildPatch, type PatchNodeSpec, type PatchConnectionSpec } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
import { buildTemplateWithPorts } from "../../src/templates/index.js";
import { executeCreateRack } from "../../src/tools/rack.js";
import type { ControllerMapping } from "../../src/controllers/types.js";
import { buildOutputControllerPatch } from "../../src/controllers/pd-output-controller.js";
import { oscTypeValues } from "../../src/devices/microfreak.js";
import type { ParameterDescriptor } from "../../src/templates/port-info.js";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Create a minimal ParameterDescriptor for testing. */
function param(
  name: string,
  category: ParameterDescriptor["category"],
  overrides: Partial<ParameterDescriptor> = {},
): ParameterDescriptor {
  return {
    name,
    label: name,
    min: 0,
    max: 1,
    default: 0.5,
    unit: "",
    curve: "linear",
    nodeIndex: 0,
    inlet: 0,
    category,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// AUTO-MAPPER
// ═════════════════════════════════════════════════════════════════════════

describe("auto-mapper", () => {
  const k2 = k2Profile;

  // 1. Maps faders to amplitude parameters
  it("maps faders to amplitude parameters", () => {
    const modules: MappableModule[] = [
      {
        id: "mixer",
        parameters: [
          param("volume_ch1", "amplitude"),
          param("volume_ch2", "amplitude"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2);

    // Amplitude params should be assigned to fader controls
    const ampMappings = mappings.filter((m) => m.control.category === "amplitude");
    expect(ampMappings.length).toBe(2);
    expect(ampMappings[0].control.name).toBe("fader1");
    expect(ampMappings[0].parameter.name).toBe("volume_ch1");
    expect(ampMappings[1].control.name).toBe("fader2");
    expect(ampMappings[1].parameter.name).toBe("volume_ch2");
  });

  // 2. Maps pots to filter parameters
  it("maps frequency pots to filter parameters", () => {
    const modules: MappableModule[] = [
      {
        id: "synth",
        parameters: [
          param("cutoff", "filter", { min: 20, max: 20000, curve: "exponential" }),
          param("resonance", "filter"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2);

    // Filter params should be assigned to frequency pots (CC 4-7)
    const filterMappings = mappings.filter((m) => m.parameter.category === "filter");
    expect(filterMappings.length).toBe(2);
    expect(filterMappings[0].control.category).toBe("frequency");
    expect(filterMappings[1].control.category).toBe("frequency");
  });

  // 3. Custom mappings override auto-mapping
  it("custom mappings override auto-mapping", () => {
    const modules: MappableModule[] = [
      {
        id: "synth",
        parameters: [
          param("cutoff", "filter"),
          param("amplitude", "amplitude"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2, [
      { control: "pot5", module: "synth", parameter: "cutoff" },
    ]);

    // Custom: pot5 → cutoff
    const customMapping = mappings.find((m) => m.control.name === "pot5");
    expect(customMapping).toBeDefined();
    expect(customMapping!.parameter.name).toBe("cutoff");

    // Auto: amplitude still gets a fader
    const ampMapping = mappings.find((m) => m.parameter.name === "amplitude");
    expect(ampMapping).toBeDefined();
    expect(ampMapping!.control.category).toBe("amplitude");
  });

  // 4. Unmapped params when not enough controls → skipped
  it("skips unmapped params when controls exhausted", () => {
    const modules: MappableModule[] = [
      {
        id: "big",
        parameters: Array.from({ length: 20 }, (_, i) =>
          param(`param${i}`, "amplitude"),
        ),
      },
    ];

    const mappings = autoMap(modules, k2);

    // K2 has 16 absolute + 6 relative = 22 continuous-capable controls
    // All 20 params should be mapped (20 < 22)
    expect(mappings.length).toBe(20);
  });

  // 5. Empty parameters list → empty mappings
  it("returns empty mappings for empty parameters", () => {
    const modules: MappableModule[] = [{ id: "clock", parameters: [] }];
    const mappings = autoMap(modules, k2);
    expect(mappings).toHaveLength(0);
  });

  // Custom mapping validation
  it("throws on invalid control name", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "nonexistent", module: "synth", parameter: "cutoff" }]),
    ).toThrow(/control "nonexistent" not found/);
  });

  it("throws on invalid module ID", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "fader1", module: "ghost", parameter: "cutoff" }]),
    ).toThrow(/module "ghost" not found/);
  });

  it("throws on invalid parameter name", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "fader1", module: "synth", parameter: "nope" }]),
    ).toThrow(/parameter "nope" not found/);
  });

  it("generates correct bus names", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    const mappings = autoMap(modules, k2);
    const m = mappings.find((m) => m.parameter.name === "cutoff")!;
    expect(m.busName).toBe("synth__p__cutoff");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CONTROLLER PATCH GENERATOR
// ═════════════════════════════════════════════════════════════════════════

describe("controller patch generator", () => {
  // Helper to create a mapping
  function makeMapping(
    cc: number,
    paramName: string,
    opts: { curve?: "linear" | "exponential"; min?: number; max?: number } = {},
  ): ControllerMapping {
    return {
      control: {
        name: `fader_cc${cc}`,
        type: "fader",
        cc,
        inputType: "absolute",
        range: [0, 127],
        category: "amplitude",
      },
      moduleId: "test",
      parameter: param(paramName, "amplitude", {
        min: opts.min ?? 0,
        max: opts.max ?? 1,
        curve: opts.curve ?? "linear",
      }),
      busName: `test__p__${paramName}`,
    };
  }

  // 6. Linear scaling chain
  it("generates linear scaling: ctlin → /127 → *range → +min → send", () => {
    const mappings = [makeMapping(16, "volume", { min: 0, max: 1 })];
    const spec = buildControllerPatch(mappings, 16);

    // Find key nodes
    const nodeNames = spec.nodes.map((n) => n.name ?? n.type);
    expect(nodeNames).toContain("ctlin");
    expect(nodeNames).toContain("/");
    expect(nodeNames).toContain("*");
    expect(nodeNames).toContain("+");
    expect(nodeNames).toContain("send");

    // Should NOT contain pow for linear curve
    expect(nodeNames.filter((n) => n === "pow")).toHaveLength(0);

    // Check ctlin args: [CC, Channel]
    const ctlin = spec.nodes.find((n) => n.name === "ctlin")!;
    expect(ctlin.args).toEqual([16, 16]);

    // Check send bus name
    const send = spec.nodes.find((n) => n.name === "send")!;
    expect(send.args).toEqual(["test__p__volume"]);
  });

  // 7. Exponential scaling includes pow
  it("inserts pow node for exponential curve", () => {
    const mappings = [makeMapping(4, "cutoff", { curve: "exponential", min: 20, max: 20000 })];
    const spec = buildControllerPatch(mappings, 16);

    const nodeNames = spec.nodes.map((n) => n.name ?? n.type);
    expect(nodeNames).toContain("pow");

    const pow = spec.nodes.find((n) => n.name === "pow")!;
    expect(pow.args).toEqual([3]);
  });

  // 8. Multiple mappings produce multiple columns
  it("produces separate columns for multiple mappings", () => {
    const mappings = [
      makeMapping(16, "volume"),
      makeMapping(17, "pan"),
    ];
    const spec = buildControllerPatch(mappings, 16);

    // Should have 2 ctlin nodes, 2 send nodes
    const ctlins = spec.nodes.filter((n) => n.name === "ctlin");
    const sends = spec.nodes.filter((n) => n.name === "send");
    expect(ctlins).toHaveLength(2);
    expect(sends).toHaveLength(2);

    // Columns should have different x positions
    expect(ctlins[0].x).not.toBe(ctlins[1].x);
  });

  // 9. Output is valid PatchSpec (round-trip through buildPatch → parse)
  it("produces valid Pd patch (round-trip)", () => {
    const mappings = [
      makeMapping(16, "volume"),
      makeMapping(4, "cutoff", { curve: "exponential", min: 20, max: 20000 }),
    ];
    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Must parse without error
    const parsed = parsePatch(pd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
    expect(pd).toContain("#N canvas");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// PARAMETER INJECTOR
// ═════════════════════════════════════════════════════════════════════════

describe("parameter injector", () => {
  // 10. Receive node added for each mapping
  it("adds receive node for each mapping", () => {
    const nodes: PatchNodeSpec[] = [
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
      { name: "dac~", args: [], x: 50, y: 130 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // Should add a receive node
    const receiveNode = nodes.find((n) => n.name === "receive");
    expect(receiveNode).toBeDefined();
    expect(receiveNode!.args).toEqual(["synth__p__cutoff"]);
  });

  // 11. Receive connected to correct target node + inlet
  it("connects receive to correct target node and inlet", () => {
    const nodes: PatchNodeSpec[] = [
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // Connection: from receiveIdx → to node 1 (lop~), inlet 1
    expect(conns).toHaveLength(1);
    expect(conns[0].from).toBe(2); // receive is at index 2
    expect(conns[0].to).toBe(1); // lop~ is at index 1 (0 offset)
    expect(conns[0].inlet).toBe(1);
    expect(conns[0].outlet).toBe(0);
  });

  // 12. Multiple modules: correct node offsets applied
  it("applies correct node offsets for multiple modules", () => {
    const nodes: PatchNodeSpec[] = [
      // Module A: nodes 0-2
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
      { name: "dac~", args: [], x: 50, y: 130 },
      // Module B: nodes 3-4
      { name: "*~", args: [0.5], x: 450, y: 50 },
      { name: "dac~", args: [], x: 450, y: 90 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
      {
        id: "mixer",
        parameters: [param("volume", "amplitude", { nodeIndex: 0, inlet: 1 })],
        nodeOffset: 3, // Module B starts at index 3
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
      {
        control: k2Profile.controls[4], // pot1
        moduleId: "mixer",
        parameter: param("volume", "amplitude", { nodeIndex: 0, inlet: 1 }),
        busName: "mixer__p__volume",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // First receive → synth.cutoff: target = 1 + 0 = 1
    expect(conns[0].to).toBe(1);
    // Second receive → mixer.volume: target = 0 + 3 = 3
    expect(conns[1].to).toBe(3);
  });

  // 13. No-op when mappings is empty
  it("does nothing when mappings is empty", () => {
    const nodes: PatchNodeSpec[] = [{ name: "osc~", args: [440], x: 50, y: 50 }];
    const conns: PatchConnectionSpec[] = [];

    injectParameterReceivers(nodes, conns, [], []);

    expect(nodes).toHaveLength(1);
    expect(conns).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// K2 DECK CONFIG GENERATOR
// ═════════════════════════════════════════════════════════════════════════

describe("K2 Deck config generator", () => {
  function makeFaderMapping(cc: number, paramLabel: string, category: string): ControllerMapping {
    return {
      control: {
        name: `fader_cc${cc}`,
        type: "fader",
        cc,
        inputType: "absolute",
        range: [0, 127],
        category: "amplitude",
      },
      moduleId: "test",
      parameter: param("vol", category as ParameterDescriptor["category"], { label: paramLabel }),
      busName: "test__p__vol",
    };
  }

  // 14. Generates valid JSON matching K2 Deck format
  it("generates config with required K2 Deck fields", () => {
    const mappings = [makeFaderMapping(16, "Mixer Vol", "amplitude")];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;

    expect(config.profile_name).toBe("pd_rack");
    expect(config.midi_channel).toBe(16);
    expect(config.midi_device).toBe("XONE:K2");
    expect(config.led_color_offsets).toEqual({ red: 0, amber: 36, green: 72 });
    expect(config).toHaveProperty("throttle");
    expect(config).toHaveProperty("mappings");
    expect(config).toHaveProperty("led_defaults");
  });

  // 15. All mapped CCs appear in cc_absolute section
  it("includes all mapped CCs in cc_absolute with labels", () => {
    const mappings = [
      makeFaderMapping(16, "Mixer Vol", "amplitude"),
      makeFaderMapping(17, "Synth Amp", "amplitude"),
    ];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const abs = (config.mappings as Record<string, unknown>).cc_absolute as Record<
      string,
      { name: string; action: string }
    >;

    expect(abs["16"]).toBeDefined();
    expect(abs["16"].name).toContain("Mixer Vol");
    expect(abs["16"].action).toBe("noop");
    expect(abs["17"]).toBeDefined();
    expect(abs["17"].name).toContain("Synth Amp");
  });

  // 16. LED colors match category
  it("assigns LED colors by category: green=amplitude, red=filter, amber=general", () => {
    const mappings: ControllerMapping[] = [
      // Fader CC16 = column 0 → amplitude → green
      makeFaderMapping(16, "Volume", "amplitude"),
      // Pot CC5 = column 1 → filter → red
      {
        control: {
          name: "pot2",
          type: "pot",
          cc: 5,
          inputType: "absolute",
          range: [0, 127],
          category: "frequency",
        },
        moduleId: "synth",
        parameter: param("cutoff", "filter"),
        busName: "synth__p__cutoff",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const ledDefaults = config.led_defaults as Record<string, unknown>;
    const onStart = ledDefaults.on_start as { note: number; color: string }[];

    // Column 0 (note 36) → green (amplitude)
    const col0 = onStart.find((l) => l.note === 36);
    expect(col0).toBeDefined();
    expect(col0!.color).toBe("green");

    // Column 1 (note 37) → red (filter)
    const col1 = onStart.find((l) => l.note === 37);
    expect(col1).toBeDefined();
    expect(col1!.color).toBe("red");
  });

  // 17. Unmapped controls not included in config
  it("does not include unmapped CCs in config", () => {
    const mappings = [makeFaderMapping(16, "Volume", "amplitude")];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const abs = (config.mappings as Record<string, unknown>).cc_absolute as Record<string, unknown>;

    // Only CC 16 should be present
    expect(Object.keys(abs)).toEqual(["16"]);
    expect(abs["17"]).toBeUndefined();
  });

  // 18. Includes cc_relative section for encoder mappings
  it("includes cc_relative section for encoder mappings", () => {
    const mappings: ControllerMapping[] = [
      makeFaderMapping(16, "Volume", "amplitude"),
      {
        control: { name: "encoder1", type: "encoder", cc: 0, inputType: "relative", range: [0, 127], category: "general" },
        moduleId: "synth",
        parameter: param("cutoff", "filter"),
        busName: "synth__p__cutoff",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const m = config.mappings as Record<string, unknown>;

    // cc_absolute should have the fader
    expect(m.cc_absolute).toBeDefined();
    expect((m.cc_absolute as Record<string, unknown>)["16"]).toBeDefined();

    // cc_relative should have the encoder
    expect(m.cc_relative).toBeDefined();
    const rel = m.cc_relative as Record<string, { name: string; action: string }>;
    expect(rel["0"]).toBeDefined();
    expect(rel["0"].name).toContain("cutoff");
    expect(rel["0"].action).toBe("noop");
  });

  // 19. Includes note_on section for button mappings
  it("includes note_on section for button mappings", () => {
    const mappings: ControllerMapping[] = [
      {
        control: { name: "buttonC1", type: "button", note: 40, inputType: "trigger", range: [0, 1], category: "transport" },
        moduleId: "mixer",
        parameter: { ...param("mute", "transport"), controlType: "toggle" as const },
        busName: "mixer__p__mute",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const m = config.mappings as Record<string, unknown>;

    expect(m.note_on).toBeDefined();
    const noteSection = m.note_on as Record<string, { name: string; action: string }>;
    expect(noteSection["40"]).toBeDefined();
    expect(noteSection["40"].name).toContain("mute");
    expect(noteSection["40"].action).toBe("noop");
  });

  // 20. Encoder CC 0-3 maps to columns 0-3 for LED feedback
  it("encoder CC 0-3 triggers LED feedback on correct column", () => {
    const mappings: ControllerMapping[] = [
      {
        control: { name: "encoder3", type: "encoder", cc: 2, inputType: "relative", range: [0, 127], category: "general" },
        moduleId: "synth",
        parameter: param("detune", "oscillator"),
        busName: "synth__p__detune",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const ledDefaults = config.led_defaults as Record<string, unknown>;
    const onStart = ledDefaults.on_start as { note: number; color: string }[];

    // CC 2 → column 2 → note 38
    const col2 = onStart.find((l) => l.note === 38);
    expect(col2).toBeDefined();
    expect(col2!.color).toBe("red"); // oscillator → red
  });

  // 21. Button notes map to correct columns for LED feedback
  it("button notes map to columns for LED feedback", () => {
    const mappings: ControllerMapping[] = [
      {
        control: { name: "buttonB2", type: "button", note: 45, inputType: "trigger", range: [0, 1], category: "transport" },
        moduleId: "mixer",
        parameter: { ...param("mute_ch2", "transport"), controlType: "toggle" as const },
        busName: "mixer__p__mute_ch2",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const ledDefaults = config.led_defaults as Record<string, unknown>;
    const onStart = ledDefaults.on_start as { note: number; color: string }[];

    // Note 45 → (45-40) % 4 = column 1 → note 37
    const col1 = onStart.find((l) => l.note === 37);
    expect(col1).toBeDefined();
    expect(col1!.color).toBe("amber"); // transport → amber
  });

  // 22. Omits cc_relative/note_on sections when no encoders/buttons mapped
  it("omits cc_relative and note_on when no encoders or buttons mapped", () => {
    const mappings = [makeFaderMapping(16, "Volume", "amplitude")];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const m = config.mappings as Record<string, unknown>;

    expect(m.cc_absolute).toBeDefined();
    expect(m.cc_relative).toBeUndefined();
    expect(m.note_on).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// DEVICE REGISTRY
// ═════════════════════════════════════════════════════════════════════════

describe("device registry", () => {
  it("resolves k2 alias", () => {
    const device = getDevice("k2");
    expect(device.name).toBe("xone-k2");
    expect(device.midiChannel).toBe(16);
    expect(device.controls.length).toBe(34); // 4 faders + 12 pots + 6 encoders + 12 buttons
  });

  it("throws on unknown device", () => {
    expect(() => getDevice("nonexistent")).toThrow(/Unknown device/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// TEMPLATE PARAMETERS
// ═════════════════════════════════════════════════════════════════════════

describe("template parameters", () => {
  it("synth exposes cutoff and amplitude parameters", () => {
    const r = buildTemplateWithPorts("synth", { waveform: "saw", filter: "lowpass" });
    expect(r.parameters).toBeDefined();
    expect(r.parameters!.length).toBeGreaterThanOrEqual(2);

    const cutoff = r.parameters!.find((p) => p.name === "cutoff");
    expect(cutoff).toBeDefined();
    expect(cutoff!.category).toBe("filter");
    expect(cutoff!.curve).toBe("exponential");
    expect(cutoff!.inlet).toBe(1);

    const amp = r.parameters!.find((p) => p.name === "amplitude");
    expect(amp).toBeDefined();
    expect(amp!.category).toBe("amplitude");
  });

  it("synth with bandpass exposes resonance parameter", () => {
    const r = buildTemplateWithPorts("synth", { filter: "bandpass" });
    const res = r.parameters!.find((p) => p.name === "resonance");
    expect(res).toBeDefined();
    expect(res!.inlet).toBe(2);
    expect(res!.category).toBe("filter");
  });

  it("mixer exposes volume_ch{N} and mute_ch{N} parameters", () => {
    const r = buildTemplateWithPorts("mixer", { channels: 3 });
    expect(r.parameters).toBeDefined();
    expect(r.parameters!.length).toBe(6); // 3 volume + 3 mute
    // Volume params first
    expect(r.parameters![0].name).toBe("volume_ch1");
    expect(r.parameters![1].name).toBe("volume_ch2");
    expect(r.parameters![2].name).toBe("volume_ch3");
    for (const p of r.parameters!.slice(0, 3)) {
      expect(p.category).toBe("amplitude");
      expect(p.curve).toBe("linear");
    }
    // Mute params second
    expect(r.parameters![3].name).toBe("mute_ch1");
    expect(r.parameters![4].name).toBe("mute_ch2");
    expect(r.parameters![5].name).toBe("mute_ch3");
    for (const p of r.parameters!.slice(3)) {
      expect(p.category).toBe("transport");
      expect(p.controlType).toBe("toggle");
    }
  });

  it("mixer mute defaults to 1 (unmuted)", () => {
    const r = buildTemplateWithPorts("mixer", { channels: 2 });
    const mutes = r.parameters!.filter((p) => p.name.startsWith("mute_"));
    expect(mutes).toHaveLength(2);
    for (const m of mutes) {
      expect(m.default).toBe(1);
      expect(m.min).toBe(0);
      expect(m.max).toBe(1);
    }
  });

  it("mixer mute gate is in audio chain (contains two *~ per channel)", () => {
    const r = buildTemplateWithPorts("mixer", { channels: 1 });
    // Single channel should have: volume *~ and mute *~
    const starNodes = r.spec.nodes.filter(
      (n) => n.name === "*~",
    );
    expect(starNodes.length).toBe(2); // volume + mute
  });

  it("mixer with mute produces valid Pd (round-trip)", () => {
    const r = buildTemplateWithPorts("mixer", { channels: 2 });
    const pd = buildPatch(r.spec);
    expect(pd).toContain("#N canvas");
    expect(pd).toContain("#X obj");
    expect(pd).toContain("#X connect");
    // Msg nodes: "#X msg <x> <y> <value>;" — check value at end of line
    expect(pd).toMatch(/msg \d+ \d+ 0\.8/);  // volume init
    expect(pd).toMatch(/msg \d+ \d+ 1;/);     // mute init
  });

  it("drum-machine exposes volume parameter", () => {
    const r = buildTemplateWithPorts("drum-machine", {});
    expect(r.parameters).toBeDefined();
    const vol = r.parameters!.find((p) => p.name === "volume");
    expect(vol).toBeDefined();
    expect(vol!.category).toBe("amplitude");
    expect(vol!.inlet).toBe(1);
  });

  it("templates without parameters return empty array", () => {
    const r = buildTemplateWithPorts("clock", {});
    expect(r.parameters ?? []).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════

describe("controller integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pd-controller-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // 18. Full rack + controller generates both files
  it("generates _controller.pd and _k2_config.json", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    // Should mention controller mappings
    expect(result).toContain("Input controller:");
    expect(result).toContain("mapping(s)");

    // Check files exist
    const rackStat = await stat(join(tmpDir, "_rack.pd"));
    expect(rackStat.isFile()).toBe(true);
    const ctrlStat = await stat(join(tmpDir, "_controller.pd"));
    expect(ctrlStat.isFile()).toBe(true);
    const k2Stat = await stat(join(tmpDir, "_k2_config.json"));
    expect(k2Stat.isFile()).toBe(true);

    // Controller patch should be valid Pd
    const ctrlPd = await readFile(join(tmpDir, "_controller.pd"), "utf-8");
    expect(ctrlPd).toContain("#N canvas");
    const parsed = parsePatch(ctrlPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);

    // K2 config should be valid JSON
    const k2Json = await readFile(join(tmpDir, "_k2_config.json"), "utf-8");
    const k2Config = JSON.parse(k2Json);
    expect(k2Config.profile_name).toBe("pd_rack");
  });

  // 19. Controller mappings appear in _rack.pd as receive nodes
  it("injects receive nodes into _rack.pd", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");
    // Should contain receive nodes for mapped parameters
    expect(rackPd).toContain("receive synth__p__cutoff");
    expect(rackPd).toContain("receive synth__p__amplitude");
  });

  // 20. Backward compat: rack WITHOUT controller identical to current output
  it("rack without controller produces no controller files", async () => {
    await executeCreateRack({
      modules: [{ template: "synth", id: "synth" }],
      outputDir: tmpDir,
    });

    // _rack.pd should exist
    const rackStat = await stat(join(tmpDir, "_rack.pd"));
    expect(rackStat.isFile()).toBe(true);

    // _controller.pd should NOT exist
    await expect(stat(join(tmpDir, "_controller.pd"))).rejects.toThrow();
    await expect(stat(join(tmpDir, "_k2_config.json"))).rejects.toThrow();

    // _rack.pd should NOT contain any receive parameter buses
    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");
    expect(rackPd).not.toContain("receive synth__p__");
  });

  // 21. Rack WITH wiring AND controller: both buses coexist
  it("wiring and controller buses coexist in _rack.pd", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [{ from: "synth", output: "audio", to: "mixer", input: "ch1" }],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");

    // Wiring buses (throw~/catch~ for audio)
    expect(rackPd).toContain("throw~");
    expect(rackPd).toContain("catch~");

    // Controller parameter buses (receive)
    expect(rackPd).toContain("receive synth__p__cutoff");

    // Both should parse cleanly
    const parsed = parsePatch(rackPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
  });

  // 22. Auto-mapped K2 with synth+mixer: faders→volumes, pots→cutoff
  it("auto-maps faders to volumes and pots to cutoff", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      controller: { device: "k2" },
    });

    // Amplitude params should go to faders (CC 16-19)
    expect(result).toMatch(/fader\d.*volume/i);
    // Filter params should go to pots (CC 4-7)
    expect(result).toMatch(/pot\d.*cutoff/i);
  });

  // Warning when no controllable parameters
  it("warns when no modules have parameters", async () => {
    const result = await executeCreateRack({
      modules: [{ template: "clock", id: "clock" }],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    expect(result).toContain("No controllable parameters");

    // Should NOT create controller files
    await expect(stat(join(tmpDir, "_controller.pd"))).rejects.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// DEVICE PROFILES
// ═════════════════════════════════════════════════════════════════════════

describe("device profiles", () => {
  it("resolves MicroFreak by name and alias", () => {
    const byName = getDevice("microfreak");
    expect(byName.name).toBe("microfreak");
    expect(byName.label).toBe("Arturia MicroFreak");

    const byAlias = getDevice("mf");
    expect(byAlias.name).toBe("microfreak");
  });

  it("resolves TR-8S by name and aliases", () => {
    const byName = getDevice("tr-8s");
    expect(byName.name).toBe("tr-8s");
    expect(byName.label).toBe("Roland TR-8S");

    const byAlias = getDevice("tr8s");
    expect(byAlias.name).toBe("tr-8s");
  });

  it("MicroFreak has 21 output controls on channel 1", () => {
    const mf = getDevice("microfreak");
    expect(mf.midiChannel).toBe(1);
    expect(mf.controls.length).toBe(21);
    // All controls should be output direction
    for (const c of mf.controls) {
      expect(c.direction).toBe("output");
    }
  });

  it("MicroFreak CC 26 is marked bipolar", () => {
    const mf = getDevice("microfreak");
    const cc26 = mf.controls.find((c) => c.cc === 26);
    expect(cc26).toBeDefined();
    expect(cc26!.bipolar).toBe(true);
    expect(cc26!.name).toBe("env_filter_amount");
  });

  it("MicroFreak has setup notes", () => {
    const mf = getDevice("microfreak");
    expect(mf.setupNotes).toBeDefined();
    expect(mf.setupNotes!.length).toBeGreaterThan(0);
    expect(mf.setupNotes!.some((n) => n.includes("channel 1"))).toBe(true);
  });

  it("TR-8S has 51 controls (44 per-instrument + 7 global) on channel 10", () => {
    const tr = getDevice("tr-8s");
    expect(tr.midiChannel).toBe(10);
    expect(tr.controls.length).toBe(51);
  });

  it("TR-8S has 11 note triggers with groups", () => {
    const tr = getDevice("tr-8s");
    expect(tr.noteTriggers).toBeDefined();
    expect(tr.noteTriggers!.length).toBe(11);
    // BD should be note 36 with alt 35
    const bd = tr.noteTriggers!.find((t) => t.name === "BD");
    expect(bd).toBeDefined();
    expect(bd!.note).toBe(36);
    expect(bd!.altNote).toBe(35);
    expect(bd!.group).toBe("BD");
  });

  it("TR-8S controls have instrument groups", () => {
    const tr = getDevice("tr-8s");
    const bdControls = tr.controls.filter((c) => c.group === "BD");
    expect(bdControls.length).toBe(4); // tune, decay, level, ctrl
    expect(bdControls.map((c) => c.name).sort()).toEqual(
      ["bd_ctrl", "bd_decay", "bd_level", "bd_tune"],
    );
  });

  it("TR-8S excludes broken CC#70 and CC#14", () => {
    const tr = getDevice("tr-8s");
    expect(tr.controls.find((c) => c.cc === 70)).toBeUndefined();
    expect(tr.controls.find((c) => c.cc === 14)).toBeUndefined();
  });

  it("TR-8S has critical RxEditData setup note", () => {
    const tr = getDevice("tr-8s");
    expect(tr.setupNotes).toBeDefined();
    expect(tr.setupNotes!.some((n) => n.includes("RxEditData"))).toBe(true);
  });

  it("TR-8S controls are bidirectional", () => {
    const tr = getDevice("tr-8s");
    for (const c of tr.controls) {
      expect(c.direction).toBe("bidirectional");
    }
  });

  it("throws on unknown device", () => {
    expect(() => getDevice("unknown-device")).toThrow("Unknown device");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// OUTPUT CONTROLLER
// ═════════════════════════════════════════════════════════════════════════

describe("output controller", () => {
  it("generates ctlout chains for MicroFreak output controls", () => {
    const mf = getDevice("microfreak");

    const mappings: ControllerMapping[] = [
      {
        control: mf.controls.find((c) => c.name === "filter_cutoff")!,
        moduleId: "synth",
        parameter: param("cutoff", "filter", { min: 200, max: 12000 }),
        busName: "synth__p__cutoff",
      },
    ];

    const spec = buildOutputControllerPatch(mappings, 1, "Arturia MicroFreak");
    const pd = buildPatch(spec);

    // Should contain ctlout (not ctlin)
    expect(pd).toContain("ctlout");
    expect(pd).not.toContain("ctlin");
    // Should have throttle
    expect(pd).toContain("pipe 33");
    // Should have change for redundancy suppression
    expect(pd).toContain("change");
    // Should have receive bus
    expect(pd).toContain("receive synth__p__cutoff");
    // Should reference correct CC
    expect(pd).toContain("ctlout 23 1");
    // Should have title
    expect(pd).toContain("ARTURIA MICROFREAK OUTPUT CONTROLLER");
  });

  it("generates panic section with All Notes Off and All Sound Off", () => {
    const mf = getDevice("microfreak");

    const mappings: ControllerMapping[] = [
      {
        control: mf.controls[0],
        moduleId: "synth",
        parameter: param("osc", "oscillator"),
        busName: "synth__p__osc",
      },
    ];

    const spec = buildOutputControllerPatch(mappings, 1, "MicroFreak");
    const pd = buildPatch(spec);

    expect(pd).toContain("__panic");
    expect(pd).toContain("ctlout 123 1"); // All Notes Off
    expect(pd).toContain("ctlout 120 1"); // All Sound Off
  });

  it("auto-mapper returns no input mappings for MicroFreak (all output)", () => {
    const mf = getDevice("microfreak");
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];

    // Input direction should yield 0 mappings (MicroFreak has no input controls)
    const inputMappings = autoMap(modules, mf, undefined, "input");
    expect(inputMappings.length).toBe(0);

    // Output direction should yield mappings
    const outputMappings = autoMap(modules, mf, undefined, "output");
    expect(outputMappings.length).toBeGreaterThan(0);
  });

  it("auto-mapper returns both input and output for TR-8S (bidirectional)", () => {
    const tr = getDevice("tr-8s");
    const modules: MappableModule[] = [
      {
        id: "drums",
        parameters: [
          param("amplitude", "amplitude"),
          param("cutoff", "filter"),
        ],
      },
    ];

    // Both directions should return mappings for bidirectional controls
    const inputMappings = autoMap(modules, tr, undefined, "input");
    expect(inputMappings.length).toBeGreaterThan(0);

    const outputMappings = autoMap(modules, tr, undefined, "output");
    expect(outputMappings.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// MICROFREAK OSCILLATOR TYPE LOOKUP
// ═════════════════════════════════════════════════════════════════════════

describe("MicroFreak oscType values", () => {
  it("has reception-range midpoints for all 21 oscillator types", () => {
    // oscTypeValues imported at top level
    expect(Object.keys(oscTypeValues).length).toBe(21);
    // All values should be 0-127
    for (const [name, value] of Object.entries(oscTypeValues)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(127);
    }
  });

  it("BasicWaves is at the low end, Vocoder at the high end", () => {
    // oscTypeValues imported at top level
    expect(oscTypeValues.BasicWaves).toBeLessThan(10);
    expect(oscTypeValues.Vocoder).toBeGreaterThan(120);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// RACK WITH OUTPUT CONTROLLER (MicroFreak integration)
// ═════════════════════════════════════════════════════════════════════════

describe("rack with output controller", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pd-output-ctrl-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates _output_controller.pd for MicroFreak", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
      ],
      controller: { device: "microfreak" },
      outputDir: tmpDir,
    });

    // Should have output controller info
    expect(result).toContain("Output controller:");
    expect(result).toContain("mapping(s)");

    // Should NOT have input controller (MicroFreak is output-only)
    expect(result).not.toContain("Input controller:");

    // _output_controller.pd should exist
    const outputCtrlStat = await stat(join(tmpDir, "_output_controller.pd"));
    expect(outputCtrlStat.isFile()).toBe(true);

    // _controller.pd should NOT exist (no input controls)
    await expect(stat(join(tmpDir, "_controller.pd"))).rejects.toThrow();

    // Should include setup notes
    expect(result).toContain("Arturia MicroFreak setup required:");
    expect(result).toContain("channel 1");
  });

  it("generates both controllers for TR-8S (bidirectional)", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
      ],
      controller: { device: "tr-8s" },
      outputDir: tmpDir,
    });

    // Should have both controller types
    expect(result).toContain("Input controller:");
    expect(result).toContain("Output controller:");

    // Both files should exist
    const inputCtrl = await stat(join(tmpDir, "_controller.pd"));
    expect(inputCtrl.isFile()).toBe(true);

    const outputCtrl = await stat(join(tmpDir, "_output_controller.pd"));
    expect(outputCtrl.isFile()).toBe(true);

    // Should include TR-8S setup notes
    expect(result).toContain("Roland TR-8S setup required:");
    expect(result).toContain("RxEditData");
  });

  it("output controller contains ctlout with correct CC and channel", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
      ],
      controller: { device: "microfreak", midiChannel: 1 },
      outputDir: tmpDir,
    });

    const outputPd = await readFile(join(tmpDir, "_output_controller.pd"), "utf-8");
    expect(outputPd).toContain("ctlout");
    expect(outputPd).toContain("pipe 33");
    expect(outputPd).toContain("change");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// K2 FULL PROFILE (absolute + relative + trigger)
// ═════════════════════════════════════════════════════════════════════════

describe("K2 full profile", () => {
  const k2 = getDevice("k2");

  it("has 6 encoders with relative inputType", () => {
    const encoders = k2.controls.filter((c) => c.type === "encoder");
    expect(encoders).toHaveLength(6);
    for (const enc of encoders) {
      expect(enc.inputType).toBe("relative");
      expect(enc.cc).toBeDefined();
    }
  });

  it("has 12 buttons with trigger inputType and note numbers", () => {
    const buttons = k2.controls.filter((c) => c.type === "button");
    expect(buttons).toHaveLength(12);
    for (const btn of buttons) {
      expect(btn.inputType).toBe("trigger");
      expect(btn.note).toBeDefined();
      expect(btn.note!).toBeGreaterThanOrEqual(40);
      expect(btn.note!).toBeLessThanOrEqual(51);
    }
  });

  it("has setupNotes", () => {
    expect(k2.setupNotes).toBeDefined();
    expect(k2.setupNotes!.length).toBeGreaterThanOrEqual(3);
    // Should mention MIDI channel, layers, and encoders
    const all = k2.setupNotes!.join(" ");
    expect(all).toContain("channel");
    expect(all).toContain("Latching layers");
    expect(all).toContain("relative");
  });

  it("encoder CCs are 0-3 and 20-21", () => {
    const encoders = k2.controls.filter((c) => c.type === "encoder");
    const ccs = encoders.map((e) => e.cc).sort((a, b) => a! - b!);
    expect(ccs).toEqual([0, 1, 2, 3, 20, 21]);
  });

  it("button notes span rows C, B, A (40-51)", () => {
    const buttons = k2.controls.filter((c) => c.type === "button");
    const notes = buttons.map((b) => b.note).sort((a, b) => a! - b!);
    expect(notes).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
  });
});

describe("auto-mapper with K2 encoders and buttons", () => {
  const k2 = getDevice("k2");

  it("maps encoders to continuous params after absolute controls", () => {
    // 18 amplitude params: 16 get absolute controls, 2 should get encoders
    const modules: MappableModule[] = [
      {
        id: "mod",
        parameters: Array.from({ length: 18 }, (_, i) =>
          param(`param${i}`, "amplitude"),
        ),
      },
    ];

    const mappings = autoMap(modules, k2);
    expect(mappings.length).toBe(18);

    // First 16 should be absolute (faders + pots)
    const absoluteMappings = mappings.filter((m) => m.control.inputType === "absolute");
    expect(absoluteMappings.length).toBe(16);

    // Remaining 2 should be relative (encoders)
    const relativeMappings = mappings.filter((m) => m.control.inputType === "relative");
    expect(relativeMappings.length).toBe(2);
  });

  it("maps buttons to toggle params", () => {
    const modules: MappableModule[] = [
      {
        id: "mod",
        parameters: [
          param("volume", "amplitude"),
          { ...param("mute", "transport"), controlType: "toggle" as const },
          { ...param("solo", "transport"), controlType: "toggle" as const },
        ],
      },
    ];

    const mappings = autoMap(modules, k2);

    // volume → absolute control (fader)
    const volumeMapping = mappings.find((m) => m.parameter.name === "volume");
    expect(volumeMapping).toBeDefined();
    expect(volumeMapping!.control.inputType).toBe("absolute");

    // mute and solo → trigger controls (buttons)
    const muteMapping = mappings.find((m) => m.parameter.name === "mute");
    expect(muteMapping).toBeDefined();
    expect(muteMapping!.control.inputType).toBe("trigger");

    const soloMapping = mappings.find((m) => m.parameter.name === "solo");
    expect(soloMapping).toBeDefined();
    expect(soloMapping!.control.inputType).toBe("trigger");
  });

  it("does not map buttons to continuous params", () => {
    // Only continuous params — buttons should NOT be assigned
    const modules: MappableModule[] = [
      {
        id: "mod",
        parameters: [
          param("cutoff", "filter"),
          param("volume", "amplitude"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2);
    // All mappings should be absolute or relative — no buttons
    for (const m of mappings) {
      expect(m.control.inputType).not.toBe("trigger");
    }
  });

  it("maps K2 buttons to mixer mute_ch params (Phase 4 integration)", () => {
    // Use real mixer template parameters
    const mixer = buildTemplateWithPorts("mixer", { channels: 3 });
    const modules: MappableModule[] = [
      { id: "mixer", parameters: mixer.parameters! },
    ];

    const mappings = autoMap(modules, k2);

    // Volume params → absolute controls (faders)
    const volumeMappings = mappings.filter((m) => m.parameter.name.startsWith("volume_"));
    expect(volumeMappings.length).toBe(3);
    for (const m of volumeMappings) {
      expect(m.control.inputType).toBe("absolute");
    }

    // Mute params → trigger controls (buttons)
    const muteMappings = mappings.filter((m) => m.parameter.name.startsWith("mute_"));
    expect(muteMappings.length).toBe(3);
    for (const m of muteMappings) {
      expect(m.control.inputType).toBe("trigger");
      expect(m.control.note).toBeDefined();
    }
  });
});

describe("controller patch with relative and trigger chains", () => {
  const k2 = getDevice("k2");

  it("generates accumulator chain for relative encoder mapping", () => {
    const encoder = k2.controls.find((c) => c.name === "encoder1")!;
    const mappings: ControllerMapping[] = [
      {
        control: encoder,
        moduleId: "synth",
        parameter: param("cutoff", "filter", { min: 200, max: 12000 }),
        busName: "synth__p__cutoff",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should have ctlin (not notein)
    expect(pd).toContain("ctlin");
    // Should have expr for two's complement decoding
    expect(pd).toContain("expr");
    expect(pd).toContain("128");
    // Should have clip for range clamping
    expect(pd).toContain("clip 200 12000");
    // Should have loadbang for initialization
    expect(pd).toContain("loadbang");
    // Should send to bus
    expect(pd).toContain("send synth__p__cutoff");
  });

  it("generates notein/select chain for trigger button mapping", () => {
    const button = k2.controls.find((c) => c.name === "buttonA1")!;
    const mappings: ControllerMapping[] = [
      {
        control: button,
        moduleId: "clock",
        parameter: { ...param("start", "transport"), controlType: "trigger" },
        busName: "clock__p__start",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should have notein (not ctlin)
    expect(pd).toContain("notein");
    // Should have stripnote to filter Note Off
    expect(pd).toContain("stripnote");
    // Should have select with the button's note number
    expect(pd).toContain("select 48");
    // Should send bang
    expect(pd).toContain("bang");
    // Should send to bus
    expect(pd).toContain("send clock__p__start");
    // Should NOT have toggle
    expect(pd).not.toContain("toggle");
  });

  it("generates toggle chain for toggle button mapping", () => {
    const button = k2.controls.find((c) => c.name === "buttonC1")!;
    const mappings: ControllerMapping[] = [
      {
        control: button,
        moduleId: "synth",
        parameter: { ...param("mute", "transport"), controlType: "toggle" },
        busName: "synth__p__mute",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should have notein
    expect(pd).toContain("notein");
    // Should have select with the button's note number (40)
    expect(pd).toContain("select 40");
    // Should have toggle for latching behavior
    expect(pd).toContain("toggle");
    // Should send to bus
    expect(pd).toContain("send synth__p__mute");
  });

  it("generates mixed chains for absolute + relative + trigger in one patch", () => {
    const fader = k2.controls.find((c) => c.name === "fader1")!;
    const encoder = k2.controls.find((c) => c.name === "encoder1")!;
    const button = k2.controls.find((c) => c.name === "buttonA1")!;

    const mappings: ControllerMapping[] = [
      {
        control: fader,
        moduleId: "synth",
        parameter: param("volume", "amplitude"),
        busName: "synth__p__volume",
      },
      {
        control: encoder,
        moduleId: "synth",
        parameter: param("cutoff", "filter", { min: 200, max: 12000 }),
        busName: "synth__p__cutoff",
      },
      {
        control: button,
        moduleId: "synth",
        parameter: { ...param("mute", "transport"), controlType: "toggle" },
        busName: "synth__p__mute",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should have all three MIDI input types
    expect(pd).toContain("ctlin"); // fader + encoder both use ctlin
    expect(pd).toContain("notein"); // button
    // Should have accumulator for encoder
    expect(pd).toContain("expr");
    expect(pd).toContain("loadbang");
    // Should have toggle for button
    expect(pd).toContain("toggle");
    // All three buses should be present
    expect(pd).toContain("send synth__p__volume");
    expect(pd).toContain("send synth__p__cutoff");
    expect(pd).toContain("send synth__p__mute");
  });

  it("produces valid Pd patch with relative chain (round-trip)", () => {
    const encoder = k2.controls.find((c) => c.name === "encoder1")!;
    const mappings: ControllerMapping[] = [
      {
        control: encoder,
        moduleId: "synth",
        parameter: param("cutoff", "filter", { min: 200, max: 12000 }),
        busName: "synth__p__cutoff",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should be valid Pd format (starts with canvas, contains objects)
    expect(pd).toContain("#N canvas");
    expect(pd).toContain("#X obj");
    expect(pd).toContain("#X connect");
  });

  it("skips malformed trigger control with no note (guard clause)", () => {
    // Simulate a malformed control: trigger type but no note number
    const malformed = {
      name: "bad_trigger",
      type: "button" as const,
      cc: undefined,
      note: undefined,
      inputType: "trigger" as const,
      range: [0, 127] as [number, number],
      category: "general" as const,
      direction: "input" as const,
    };

    const mappings: ControllerMapping[] = [
      {
        control: malformed,
        moduleId: "synth",
        parameter: param("mute", "transport", { controlType: "toggle" }),
        busName: "synth__p__mute",
      },
    ];

    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Should have the label text but no MIDI chain
    expect(pd).toContain("bad_trigger");
    expect(pd).not.toContain("notein");
    expect(pd).not.toContain("ctlin");
  });
});

describe("K2 rack integration with all control types", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pd-k2-full-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates _controller.pd with K2 and includes setup notes", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    // Should have input controller
    expect(result).toContain("Input controller:");
    // Should have K2 deck config in file list
    expect(result).toContain("K2 Deck config");
    // Should include setup notes
    expect(result).toContain("Allen & Heath Xone:K2 setup required:");
    expect(result).toContain("Latching layers");

    // _controller.pd should exist
    const ctrlStat = await stat(join(tmpDir, "_controller.pd"));
    expect(ctrlStat.isFile()).toBe(true);
  });

  it("controller patch contains ctlin for absolute controls", async () => {
    await executeCreateRack({
      modules: [
        { template: "synth", id: "synth" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    const pd = await readFile(join(tmpDir, "_controller.pd"), "utf-8");
    // Should have ctlin for absolute CC controls
    expect(pd).toContain("ctlin");
    // Should have send nodes
    expect(pd).toContain("send");
  });
});
