/**
 * Pure Data object registry with inlet/outlet metadata.
 *
 * Provides port count resolution for ~95 Pd-vanilla objects,
 * including variable-count objects like select, pack, trigger.
 */

import type { PdNode, PdCanvas } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortCount =
  | { type: "fixed"; count: number }
  | { type: "args_plus"; offset: number; minimum: number }
  | { type: "custom"; fn: (args: (string | number)[]) => number };

export interface PdObjectDef {
  name: string;
  aliases?: string[];
  category: string;
  description: string;
  signalType: "control" | "audio";
  inlets: PortCount;
  outlets: PortCount;
  defaultInlets: number;
  defaultOutlets: number;
}

// ---------------------------------------------------------------------------
// Helpers for defining port counts
// ---------------------------------------------------------------------------

const fixed = (count: number): PortCount => ({ type: "fixed", count });
const argsPlus = (offset: number, minimum: number): PortCount => ({
  type: "args_plus",
  offset,
  minimum,
});
const custom = (fn: (args: (string | number)[]) => number): PortCount => ({
  type: "custom",
  fn,
});

/** Resolve a PortCount to a concrete number given args. */
function resolveCount(pc: PortCount, args: (string | number)[]): number {
  switch (pc.type) {
    case "fixed":
      return pc.count;
    case "args_plus":
      return Math.max(args.length + pc.offset, pc.minimum);
    case "custom":
      return pc.fn(args);
  }
}

/** dac~/adc~ channel count from args. Default 2 channels. */
function dacChannels(args: (string | number)[]): number {
  if (args.length === 0) return 2;
  // dac~ 1 2 3 → 3 channels; dac~ 5 → channels up to that number
  return args.length;
}

// ---------------------------------------------------------------------------
// Registry data
// ---------------------------------------------------------------------------

const REGISTRY_DATA: PdObjectDef[] = [
  // ---- MATH ----
  ...(["+", "-", "*", "/", "%", "mod", "div", "pow", "min", "max", "clip", "atan2"] as const).map(
    (name): PdObjectDef => ({
      name,
      category: "math",
      description: `Math: ${name}`,
      signalType: "control",
      inlets: fixed(2),
      outlets: fixed(1),
      defaultInlets: 2,
      defaultOutlets: 1,
    }),
  ),
  ...(["sqrt", "exp", "log", "abs", "sin", "cos", "tan", "atan", "wrap"] as const).map(
    (name): PdObjectDef => ({
      name,
      category: "math",
      description: `Math: ${name}`,
      signalType: "control",
      inlets: fixed(1),
      outlets: fixed(1),
      defaultInlets: 1,
      defaultOutlets: 1,
    }),
  ),
  { name: "random", category: "math", description: "Random integer generator", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },

  // ---- MIDI ----
  { name: "notein", category: "midi", description: "Receive MIDI note", signalType: "control", inlets: fixed(0), outlets: fixed(3), defaultInlets: 0, defaultOutlets: 3 },
  { name: "noteout", category: "midi", description: "Send MIDI note", signalType: "control", inlets: fixed(3), outlets: fixed(0), defaultInlets: 3, defaultOutlets: 0 },
  { name: "ctlin", category: "midi", description: "Receive MIDI CC", signalType: "control", inlets: fixed(0), outlets: fixed(3), defaultInlets: 0, defaultOutlets: 3 },
  { name: "ctlout", category: "midi", description: "Send MIDI CC", signalType: "control", inlets: fixed(3), outlets: fixed(0), defaultInlets: 3, defaultOutlets: 0 },
  { name: "bendin", category: "midi", description: "Receive pitch bend", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "bendout", category: "midi", description: "Send pitch bend", signalType: "control", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "pgmin", category: "midi", description: "Receive program change", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "pgmout", category: "midi", description: "Send program change", signalType: "control", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "touchin", category: "midi", description: "Receive aftertouch", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "touchout", category: "midi", description: "Send aftertouch", signalType: "control", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "polytouchin", category: "midi", description: "Receive poly aftertouch", signalType: "control", inlets: fixed(0), outlets: fixed(3), defaultInlets: 0, defaultOutlets: 3 },
  { name: "polytouchout", category: "midi", description: "Send poly aftertouch", signalType: "control", inlets: fixed(3), outlets: fixed(0), defaultInlets: 3, defaultOutlets: 0 },
  { name: "midiin", category: "midi", description: "Raw MIDI input", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "midiout", category: "midi", description: "Raw MIDI output", signalType: "control", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "sysexin", category: "midi", description: "SysEx input", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "midirealtimein", category: "midi", description: "MIDI realtime input", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "midisystemin", category: "midi", description: "MIDI system input", signalType: "control", inlets: fixed(0), outlets: fixed(2), defaultInlets: 0, defaultOutlets: 2 },
  { name: "mtof", category: "midi", description: "MIDI note to frequency", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "ftom", category: "midi", description: "Frequency to MIDI note", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "stripnote", category: "midi", description: "Strip note-offs", signalType: "control", inlets: fixed(2), outlets: fixed(2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "makenote", category: "midi", description: "Generate note with duration", signalType: "control", inlets: fixed(3), outlets: fixed(2), defaultInlets: 3, defaultOutlets: 2 },

  // ---- TIME ----
  { name: "metro", category: "time", description: "Timed bang generator", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "delay", category: "time", description: "Delayed bang", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "timer", category: "time", description: "Measure time between bangs", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "realtime", category: "time", description: "Real time in ms", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "pipe", category: "time", description: "Delayed list pass-through", signalType: "control", inlets: argsPlus(1, 2), outlets: argsPlus(0, 1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "line", category: "time", description: "Linear ramp generator", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "line~", category: "time", description: "Audio-rate ramp", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "vline~", category: "time", description: "Audio-rate ramp (sample-accurate)", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },

  // ---- AUDIO ----
  { name: "osc~", category: "audio", description: "Cosine oscillator", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "phasor~", category: "audio", description: "Sawtooth oscillator", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "noise~", category: "audio", description: "White noise generator", signalType: "audio", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "tabosc4~", category: "audio", description: "Wavetable oscillator", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "lop~", category: "audio", description: "Low-pass filter (1-pole)", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "hip~", category: "audio", description: "High-pass filter (1-pole)", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "bp~", category: "audio", description: "Band-pass filter", signalType: "audio", inlets: fixed(3), outlets: fixed(1), defaultInlets: 3, defaultOutlets: 1 },
  { name: "vcf~", category: "audio", description: "Voltage-controlled filter", signalType: "audio", inlets: fixed(3), outlets: fixed(2), defaultInlets: 3, defaultOutlets: 2 },
  { name: "bob~", category: "audio", description: "Moog-style filter", signalType: "audio", inlets: fixed(4), outlets: fixed(1), defaultInlets: 4, defaultOutlets: 1 },
  { name: "dac~", category: "audio", description: "Audio output", signalType: "audio", inlets: custom(dacChannels), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "adc~", category: "audio", description: "Audio input", signalType: "audio", inlets: fixed(0), outlets: custom(dacChannels), defaultInlets: 0, defaultOutlets: 2 },
  ...(["+~", "-~", "*~", "/~"] as const).map(
    (name): PdObjectDef => ({
      name,
      category: "audio",
      description: `Audio math: ${name}`,
      signalType: "audio",
      inlets: fixed(2),
      outlets: fixed(1),
      defaultInlets: 2,
      defaultOutlets: 1,
    }),
  ),
  ...(["==~", "!=~", ">~", "<~", ">=~", "<=~"] as const).map(
    (name): PdObjectDef => ({
      name,
      category: "audio",
      description: `Audio comparison: ${name}`,
      signalType: "audio",
      inlets: fixed(2),
      outlets: fixed(1),
      defaultInlets: 2,
      defaultOutlets: 1,
    }),
  ),
  ...(["clip~", "wrap~", "abs~", "sqrt~"] as const).map(
    (name): PdObjectDef => ({
      name,
      category: "audio",
      description: `Audio: ${name}`,
      signalType: "audio",
      inlets: fixed(1),
      outlets: fixed(1),
      defaultInlets: 1,
      defaultOutlets: 1,
    }),
  ),
  { name: "env~", category: "audio", description: "Envelope follower", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "threshold~", category: "audio", description: "Audio threshold detector", signalType: "audio", inlets: fixed(3), outlets: fixed(2), defaultInlets: 3, defaultOutlets: 2 },
  { name: "snapshot~", category: "audio", description: "Sample audio to control", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "send~", category: "audio", description: "Wireless audio send", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "receive~", category: "audio", description: "Wireless audio receive", signalType: "audio", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "throw~", category: "audio", description: "Add to audio bus", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "catch~", category: "audio", description: "Receive from audio bus", signalType: "audio", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "delwrite~", category: "audio", description: "Write to delay line", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "delread~", category: "audio", description: "Read from delay line", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "delread4~", category: "audio", description: "4-point interpolating delay read", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "tabwrite~", category: "audio", description: "Write audio to array", signalType: "audio", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "tabread~", category: "audio", description: "Read array as audio", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "tabread4~", category: "audio", description: "4-point interpolating array read", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "readsf~", category: "audio", description: "Read sound file", signalType: "audio", inlets: fixed(1), outlets: fixed(2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "writesf~", category: "audio", description: "Write sound file", signalType: "audio", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "sig~", category: "audio", description: "Control to audio signal", signalType: "audio", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "samplerate~", category: "audio", description: "Output sample rate", signalType: "audio", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "block~", category: "audio", description: "Set block size", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "switch~", category: "audio", description: "Switch DSP on/off", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "inlet~", category: "audio", description: "Audio inlet for subpatch", signalType: "audio", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "outlet~", category: "audio", description: "Audio outlet for subpatch", signalType: "audio", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "fft~", category: "audio", description: "FFT", signalType: "audio", inlets: fixed(2), outlets: fixed(2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "ifft~", category: "audio", description: "Inverse FFT", signalType: "audio", inlets: fixed(2), outlets: fixed(2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "rfft~", category: "audio", description: "Real FFT", signalType: "audio", inlets: fixed(1), outlets: fixed(2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "rifft~", category: "audio", description: "Real inverse FFT", signalType: "audio", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },

  // ---- CONTROL ----
  { name: "bang", aliases: ["b"], category: "control", description: "Send a bang", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "float", aliases: ["f"], category: "control", description: "Store a float", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "symbol", category: "control", description: "Store a symbol", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "int", aliases: ["i"], category: "control", description: "Store an integer", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "send", aliases: ["s"], category: "control", description: "Wireless send", signalType: "control", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "receive", aliases: ["r"], category: "control", description: "Wireless receive", signalType: "control", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "select", aliases: ["sel"], category: "control", description: "Route by value", signalType: "control", inlets: fixed(2), outlets: argsPlus(1, 2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "route", category: "control", description: "Route by first element", signalType: "control", inlets: fixed(1), outlets: argsPlus(1, 2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "spigot", category: "control", description: "Pass/block messages", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "moses", category: "control", description: "Split numbers by threshold", signalType: "control", inlets: fixed(2), outlets: fixed(2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "until", category: "control", description: "Bang until stopped", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "change", category: "control", description: "Filter repeated values", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "swap", category: "control", description: "Swap two numbers", signalType: "control", inlets: fixed(2), outlets: fixed(2), defaultInlets: 2, defaultOutlets: 2 },
  { name: "value", aliases: ["v"], category: "control", description: "Shared named value", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "trigger", aliases: ["t"], category: "control", description: "Sequence outputs by type", signalType: "control", inlets: fixed(1), outlets: argsPlus(0, 2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "pack", category: "control", description: "Combine to list", signalType: "control", inlets: argsPlus(0, 2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },
  { name: "unpack", category: "control", description: "Split list", signalType: "control", inlets: fixed(1), outlets: argsPlus(0, 2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "print", category: "control", description: "Print to console", signalType: "control", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "loadbang", category: "control", description: "Bang on load", signalType: "control", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "inlet", category: "control", description: "Control inlet for subpatch", signalType: "control", inlets: fixed(0), outlets: fixed(1), defaultInlets: 0, defaultOutlets: 1 },
  { name: "outlet", category: "control", description: "Control outlet for subpatch", signalType: "control", inlets: fixed(1), outlets: fixed(0), defaultInlets: 1, defaultOutlets: 0 },
  { name: "netsend", category: "control", description: "Network send", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "netreceive", category: "control", description: "Network receive", signalType: "control", inlets: fixed(1), outlets: fixed(2), defaultInlets: 1, defaultOutlets: 2 },
  { name: "oscformat", category: "control", description: "Create OSC message", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "oscparse", category: "control", description: "Parse OSC message", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "list", category: "control", description: "List operations", signalType: "control", inlets: fixed(2), outlets: fixed(1), defaultInlets: 2, defaultOutlets: 1 },

  // ---- DATA ----
  { name: "tabread", category: "data", description: "Read from array", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "tabwrite", category: "data", description: "Write to array", signalType: "control", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "soundfiler", category: "data", description: "Read/write sound files", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "table", category: "data", description: "Named array", signalType: "control", inlets: fixed(0), outlets: fixed(0), defaultInlets: 0, defaultOutlets: 0 },
  { name: "array", category: "data", description: "Array definition", signalType: "control", inlets: fixed(0), outlets: fixed(0), defaultInlets: 0, defaultOutlets: 0 },
  { name: "text", category: "data", description: "Text buffer", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "makefilename", category: "data", description: "Format string", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "openpanel", category: "data", description: "Open file dialog", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "savepanel", category: "data", description: "Save file dialog", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },

  // ---- GUI ----
  { name: "bng", category: "gui", description: "Bang button", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "tgl", category: "gui", description: "Toggle", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "nbx", category: "gui", description: "Number box (IEM)", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "vsl", category: "gui", description: "Vertical slider", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "hsl", category: "gui", description: "Horizontal slider", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "vradio", category: "gui", description: "Vertical radio buttons", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "hradio", category: "gui", description: "Horizontal radio buttons", signalType: "control", inlets: fixed(1), outlets: fixed(1), defaultInlets: 1, defaultOutlets: 1 },
  { name: "vu", category: "gui", description: "VU meter", signalType: "control", inlets: fixed(2), outlets: fixed(0), defaultInlets: 2, defaultOutlets: 0 },
  { name: "cnv", category: "gui", description: "Canvas (decoration)", signalType: "control", inlets: fixed(0), outlets: fixed(0), defaultInlets: 0, defaultOutlets: 0 },
];

// ---------------------------------------------------------------------------
// Build lookup maps
// ---------------------------------------------------------------------------

/** Primary registry: object name → definition. */
const REGISTRY = new Map<string, PdObjectDef>();

/** Alias map: alias → canonical name. */
const ALIAS_MAP = new Map<string, string>();

for (const def of REGISTRY_DATA) {
  REGISTRY.set(def.name, def);
  if (def.aliases) {
    for (const alias of def.aliases) {
      ALIAS_MAP.set(alias, def.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Non-obj node type port counts
// ---------------------------------------------------------------------------

const NODE_TYPE_PORTS: Record<string, { inlets: number; outlets: number }> = {
  msg: { inlets: 1, outlets: 1 },
  floatatom: { inlets: 1, outlets: 1 },
  symbolatom: { inlets: 1, outlets: 1 },
  array: { inlets: 0, outlets: 0 },
  text: { inlets: 0, outlets: 0 },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up an object definition by name (resolves aliases).
 * Returns undefined for unknown objects.
 */
export function lookupObject(name: string): PdObjectDef | undefined {
  const canonical = ALIAS_MAP.get(name) ?? name;
  return REGISTRY.get(canonical);
}

/**
 * Resolve the inlet/outlet counts for a node.
 *
 * For `obj` nodes, looks up the registry and computes variable ports from args.
 * For `msg`, `floatatom`, `symbolatom`, etc., returns hardcoded port counts.
 * For unknown objects, returns null.
 */
export function resolvePortCounts(
  node: PdNode,
): { inlets: number; outlets: number } | null {
  // Non-obj types have fixed port counts
  if (node.type !== "obj") {
    const ports = NODE_TYPE_PORTS[node.type];
    return ports ?? null;
  }

  // obj nodes: look up by name
  if (!node.name) return null;

  const def = lookupObject(node.name);
  if (!def) return null;

  return {
    inlets: resolveCount(def.inlets, node.args),
    outlets: resolveCount(def.outlets, node.args),
  };
}

/**
 * Count inlets and outlets for a subpatch by examining its internal
 * inlet/outlet/inlet~/outlet~ objects.
 */
export function resolveSubpatchPorts(
  canvas: PdCanvas,
): { inlets: number; outlets: number } {
  let inlets = 0;
  let outlets = 0;

  for (const node of canvas.nodes) {
    if (node.type === "obj") {
      if (node.name === "inlet" || node.name === "inlet~") inlets++;
      if (node.name === "outlet" || node.name === "outlet~") outlets++;
    }
  }

  return { inlets, outlets };
}

/**
 * Check if an object name represents an audio-rate (~) object.
 */
export function isAudioObject(name: string): boolean {
  if (name.endsWith("~")) return true;
  const def = lookupObject(name);
  return def?.signalType === "audio";
}

/**
 * Get the category for an object name.
 */
export function getObjectCategory(name: string): string | undefined {
  const def = lookupObject(name);
  return def?.category;
}

/**
 * Get all registered objects.
 */
export function getAllObjects(): PdObjectDef[] {
  return REGISTRY_DATA;
}
