/**
 * Tests for all Zod input validation schemas.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Type A: z.object() — .safeParse() directo
import { ParsePatchInput, GeneratePatchInput } from "../../src/schemas/patch.js";
import { ValidatePatchInput, AnalyzePatchInput } from "../../src/schemas/analyze.js";

// Type B: plain objects — necesitan z.object() wrapper
import { sendMessageSchema } from "../../src/schemas/control.js";
import { createFromTemplateSchema } from "../../src/schemas/template.js";
import { createRackSchema } from "../../src/schemas/rack.js";
import { composePatchSchema } from "../../src/schemas/compose.js";
import { generateVcvSchema, listVcvModulesSchema } from "../../src/schemas/vcv.js";

// Wrap Type B schemas once
const SendMessageSchema = z.object(sendMessageSchema);
const CreateFromTemplateSchema = z.object(createFromTemplateSchema);
const CreateRackSchema = z.object(createRackSchema);
const ComposePatchSchema = z.object(composePatchSchema);
const GenerateVcvSchema = z.object(generateVcvSchema);
const ListVcvModulesSchema = z.object(listVcvModulesSchema);

// ---------------------------------------------------------------------------
// ParsePatchInput
// ---------------------------------------------------------------------------
describe("ParsePatchInput", () => {
  it("accepts a file path string", () => {
    const result = ParsePatchInput.safeParse({ source: "/path/to/file.pd" });
    expect(result.success).toBe(true);
  });

  it("accepts raw .pd text", () => {
    const result = ParsePatchInput.safeParse({
      source: "#N canvas 0 50 800 600 12;",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty string", () => {
    const result = ParsePatchInput.safeParse({ source: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing source", () => {
    const result = ParsePatchInput.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GeneratePatchInput
// ---------------------------------------------------------------------------
describe("GeneratePatchInput", () => {
  it("accepts minimal valid input", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~" }],
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for type, args, connections", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~" }],
    });
    expect(result.success).toBe(true);
    const data = result.data!;
    expect(data.nodes[0].type).toBe("obj");
    expect(data.nodes[0].args).toEqual([]);
    expect(data.connections).toEqual([]);
  });

  it("accepts full input with title, connections, outputPath", () => {
    const result = GeneratePatchInput.safeParse({
      title: "test patch",
      nodes: [
        { name: "osc~", type: "obj", args: [440] },
        { name: "dac~" },
      ],
      connections: [{ from: 0, outlet: 0, to: 1, inlet: 0 }],
      outputPath: "/tmp/test.pd",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty nodes array", () => {
    const result = GeneratePatchInput.safeParse({ nodes: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid node type", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~", type: "invalid" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid node types", () => {
    for (const type of ["obj", "msg", "floatatom", "symbolatom", "text"]) {
      const result = GeneratePatchInput.safeParse({
        nodes: [{ type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative connection indices", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~" }, { name: "dac~" }],
      connections: [{ from: -1, to: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional position overrides", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~", x: 100, y: 200 }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.nodes[0].x).toBe(100);
    expect(result.data!.nodes[0].y).toBe(200);
  });

  it("defaults connection outlet and inlet to 0", () => {
    const result = GeneratePatchInput.safeParse({
      nodes: [{ name: "osc~" }, { name: "dac~" }],
      connections: [{ from: 0, to: 1 }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.connections[0].outlet).toBe(0);
    expect(result.data!.connections[0].inlet).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ValidatePatchInput / AnalyzePatchInput
// ---------------------------------------------------------------------------
describe("ValidatePatchInput", () => {
  it("accepts valid source", () => {
    expect(ValidatePatchInput.safeParse({ source: "test" }).success).toBe(true);
  });

  it("rejects empty source", () => {
    expect(ValidatePatchInput.safeParse({ source: "" }).success).toBe(false);
  });
});

describe("AnalyzePatchInput", () => {
  it("accepts valid source", () => {
    expect(AnalyzePatchInput.safeParse({ source: "test" }).success).toBe(true);
  });

  it("rejects empty source", () => {
    expect(AnalyzePatchInput.safeParse({ source: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendMessageSchema
// ---------------------------------------------------------------------------
describe("sendMessageSchema", () => {
  it("accepts minimal valid input with defaults", () => {
    const result = SendMessageSchema.safeParse({ address: "/pd/bang" });
    expect(result.success).toBe(true);
    expect(result.data!.protocol).toBe("osc");
    expect(result.data!.host).toBe("127.0.0.1");
    expect(result.data!.args).toEqual([]);
  });

  it("accepts full input", () => {
    const result = SendMessageSchema.safeParse({
      protocol: "fudi",
      host: "192.168.1.10",
      port: 3000,
      address: "tempo",
      args: [140, "hello"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid protocol", () => {
    const result = SendMessageSchema.safeParse({
      protocol: "udp",
      address: "/pd/bang",
    });
    expect(result.success).toBe(false);
  });

  it("rejects port out of range", () => {
    expect(
      SendMessageSchema.safeParse({ address: "/pd/bang", port: 0 }).success,
    ).toBe(false);
    expect(
      SendMessageSchema.safeParse({ address: "/pd/bang", port: 65536 }).success,
    ).toBe(false);
  });

  it("rejects empty address", () => {
    expect(SendMessageSchema.safeParse({ address: "" }).success).toBe(false);
  });

  it("accepts port within valid range", () => {
    expect(
      SendMessageSchema.safeParse({ address: "/pd/bang", port: 1 }).success,
    ).toBe(true);
    expect(
      SendMessageSchema.safeParse({ address: "/pd/bang", port: 65535 }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createFromTemplateSchema
// ---------------------------------------------------------------------------
describe("createFromTemplateSchema", () => {
  it("accepts minimal valid input", () => {
    const result = CreateFromTemplateSchema.safeParse({ template: "synth" });
    expect(result.success).toBe(true);
  });

  it("accepts full input with params and outputPath", () => {
    const result = CreateFromTemplateSchema.safeParse({
      template: "sequencer",
      params: { steps: 16, bpm: 120 },
      outputPath: "/tmp/seq.pd",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing template", () => {
    const result = CreateFromTemplateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("params is optional", () => {
    const result = CreateFromTemplateSchema.safeParse({ template: "mixer" });
    expect(result.success).toBe(true);
    expect(result.data!.params).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createRackSchema
// ---------------------------------------------------------------------------
describe("createRackSchema", () => {
  it("accepts minimal valid input", () => {
    const result = CreateRackSchema.safeParse({
      modules: [{ template: "synth" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty modules array", () => {
    const result = CreateRackSchema.safeParse({ modules: [] });
    expect(result.success).toBe(false);
  });

  it("accepts full input with wiring and controller", () => {
    const result = CreateRackSchema.safeParse({
      modules: [
        { template: "synth", id: "s1" },
        { template: "reverb", id: "r1" },
      ],
      wiring: [
        { from: "s1", output: "audio", to: "r1", input: "audio_in" },
      ],
      controller: {
        device: "k2",
        midiChannel: 16,
        mappings: [
          { control: "fader1", module: "s1", parameter: "volume" },
        ],
      },
      outputDir: "/tmp/rack",
    });
    expect(result.success).toBe(true);
  });

  it("rejects midiChannel out of range", () => {
    expect(
      CreateRackSchema.safeParse({
        modules: [{ template: "synth" }],
        controller: { device: "k2", midiChannel: 0 },
      }).success,
    ).toBe(false);
    expect(
      CreateRackSchema.safeParse({
        modules: [{ template: "synth" }],
        controller: { device: "k2", midiChannel: 17 },
      }).success,
    ).toBe(false);
  });

  it("wiring and controller are optional", () => {
    const result = CreateRackSchema.safeParse({
      modules: [{ template: "synth" }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.wiring).toBeUndefined();
    expect(result.data!.controller).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// composePatchSchema
// ---------------------------------------------------------------------------
describe("composePatchSchema", () => {
  it("accepts minimal valid input (genre only)", () => {
    const result = ComposePatchSchema.safeParse({ genre: "techno" });
    expect(result.success).toBe(true);
  });

  it("accepts full input", () => {
    const result = ComposePatchSchema.safeParse({
      genre: "ambient",
      tempo: 90,
      mood: "ethereal",
      key: { root: "C", scale: "minor" },
      instruments: [
        { role: "pad" },
        { role: "bass", template: "synth", params: { waveform: "saw" } },
      ],
      effects: ["reverb", "granular"],
      controller: { device: "k2" },
      outputDir: "/tmp/song",
    });
    expect(result.success).toBe(true);
  });

  it("rejects tempo below 20", () => {
    expect(
      ComposePatchSchema.safeParse({ genre: "techno", tempo: 19 }).success,
    ).toBe(false);
  });

  it("rejects tempo above 300", () => {
    expect(
      ComposePatchSchema.safeParse({ genre: "techno", tempo: 301 }).success,
    ).toBe(false);
  });

  it("rejects non-integer tempo", () => {
    expect(
      ComposePatchSchema.safeParse({ genre: "techno", tempo: 120.5 }).success,
    ).toBe(false);
  });

  it("all optional fields default to undefined", () => {
    const result = ComposePatchSchema.safeParse({ genre: "drone" });
    expect(result.success).toBe(true);
    expect(result.data!.tempo).toBeUndefined();
    expect(result.data!.mood).toBeUndefined();
    expect(result.data!.key).toBeUndefined();
    expect(result.data!.instruments).toBeUndefined();
    expect(result.data!.effects).toBeUndefined();
    expect(result.data!.controller).toBeUndefined();
  });

  it("rejects missing genre", () => {
    expect(ComposePatchSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateVcvSchema
// ---------------------------------------------------------------------------
describe("generateVcvSchema", () => {
  it("accepts minimal valid input", () => {
    const result = GenerateVcvSchema.safeParse({
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty modules array", () => {
    expect(GenerateVcvSchema.safeParse({ modules: [] }).success).toBe(false);
  });

  it("accepts full input with cables and outputPath", () => {
    const result = GenerateVcvSchema.safeParse({
      modules: [
        { plugin: "Fundamental", model: "VCO", params: { Frequency: 2.0 } },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        {
          from: { module: 0, port: "Saw" },
          to: { module: 1, port: "Audio 1" },
          color: "#c91847",
        },
      ],
      outputPath: "/tmp/patch.vcv",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative cable module index", () => {
    const result = GenerateVcvSchema.safeParse({
      modules: [{ plugin: "Fundamental", model: "VCO" }],
      cables: [
        {
          from: { module: -1, port: "Saw" },
          to: { module: 0, port: "Freq" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("cables is optional", () => {
    const result = GenerateVcvSchema.safeParse({
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.cables).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listVcvModulesSchema
// ---------------------------------------------------------------------------
describe("listVcvModulesSchema", () => {
  it("accepts plugin only", () => {
    const result = ListVcvModulesSchema.safeParse({ plugin: "Fundamental" });
    expect(result.success).toBe(true);
  });

  it("accepts plugin and module", () => {
    const result = ListVcvModulesSchema.safeParse({
      plugin: "Fundamental",
      module: "VCO",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing plugin", () => {
    expect(ListVcvModulesSchema.safeParse({}).success).toBe(false);
  });

  it("module is optional", () => {
    const result = ListVcvModulesSchema.safeParse({ plugin: "Bogaudio" });
    expect(result.success).toBe(true);
    expect(result.data!.module).toBeUndefined();
  });
});
