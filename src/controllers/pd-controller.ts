/**
 * Controller Pd patch generator.
 *
 * Generates a _controller.pd file with routing chains for three control types:
 *
 * 1. Absolute CC (faders, pots):
 *    [ctlin CC CH] → [/ 127] → scaling → [send busName]
 *
 * 2. Relative CC (encoders, 7Fh/01h two's complement):
 *    [ctlin CC CH] → [expr if($f1<64,$f1,$f1-128)] → [+ ] → [clip min max] → [send busName]
 *    with feedback from clip output back to the accumulator [+ ]
 *
 * 3. Note trigger (buttons, momentary Note On/Off):
 *    [notein CH] → [select NOTE] → [send busName]               (trigger mode)
 *    [notein CH] → [select NOTE] → [toggle] → [send busName]    (toggle mode)
 */

import type { PatchNodeSpec, PatchConnectionSpec, PatchSpec } from "../core/serializer.js";
import type { ControllerMapping } from "./types.js";

const COL_WIDTH = 180;
const SPACING = 30;

/**
 * Build an absolute CC chain (existing behavior for faders/pots).
 * Returns the index of the last node in the chain.
 */
function buildAbsoluteChain(
  mapping: ControllerMapping,
  midiChannel: number,
  x: number,
  startY: number,
  add: (node: PatchNodeSpec) => number,
  wire: (from: number, to: number, outlet?: number, inlet?: number) => void,
): void {
  let y = startY;
  const { control, parameter, busName } = mapping;
  const cc = control.cc!;

  // ctlin CC CHANNEL (outputs value 0-127 on outlet 0)
  const ctlin = add({ name: "ctlin", args: [cc, midiChannel], x, y });
  y += SPACING;

  // Normalize: / 127 → 0.0-1.0
  const normalize = add({ name: "/", args: [127], x, y });
  wire(ctlin, normalize);
  y += SPACING;

  let lastNode = normalize;

  // Exponential curve: pow 3 (before scaling)
  if (parameter.curve === "exponential") {
    const pow = add({ name: "pow", args: [3], x, y });
    wire(lastNode, pow);
    lastNode = pow;
    y += SPACING;
  }

  // Scale: * (max - min)
  const range = parameter.max - parameter.min;
  const scale = add({ name: "*", args: [range], x, y });
  wire(lastNode, scale);
  y += SPACING;

  // Offset: + min
  const offset = add({ name: "+", args: [parameter.min], x, y });
  wire(scale, offset);
  y += SPACING;

  // Send to bus
  const send = add({ name: "send", args: [busName], x, y });
  wire(offset, send);
}

/**
 * Build a relative CC accumulator chain for encoders (7Fh/01h two's complement).
 *
 * Pd patch structure:
 *   [ctlin CC CH]
 *   |
 *   [expr if($f1 < 64, $f1, $f1 - 128)]   ← decode: 1→+1, 127→-1
 *   |
 *   [+ ]       ← accumulator (feedback from clip output)
 *   |
 *   [clip MIN MAX]
 *   |
 *   ├─→ [send busName]
 *   └─→ [+ 0]  ← identity to feed back to accumulator right inlet
 *       |
 *       └─→ [+ ] right inlet (inlet 1)
 *
 * Initialized via [loadbang] → [MIN] → accumulator to start at parameter minimum.
 */
function buildRelativeChain(
  mapping: ControllerMapping,
  midiChannel: number,
  x: number,
  startY: number,
  add: (node: PatchNodeSpec) => number,
  wire: (from: number, to: number, outlet?: number, inlet?: number) => void,
): void {
  let y = startY;
  const { control, parameter, busName } = mapping;
  const cc = control.cc!;
  const min = parameter.min;
  const max = parameter.max;

  // ctlin CC CHANNEL
  const ctlin = add({ name: "ctlin", args: [cc, midiChannel], x, y });
  y += SPACING;

  // Decode two's complement: values < 64 are positive (CW), >= 64 become negative (CCW)
  // expr: 1→+1, 127→-1, 2→+2, 126→-2, etc.
  const expr = add({ name: "expr", args: ["if($f1 < 64 \\, $f1 \\, $f1 - 128)"], x, y });
  wire(ctlin, expr);
  y += SPACING;

  // Accumulator: adds decoded increment to running total
  const accum = add({ name: "+", args: [], x, y });
  wire(expr, accum);
  y += SPACING;

  // Clip to parameter range
  const clip = add({ name: "clip", args: [min, max], x, y });
  wire(accum, clip);
  y += SPACING;

  // Send to bus
  const send = add({ name: "send", args: [busName], x, y });
  wire(clip, send);

  // Feedback: clip → [+ 0] → accumulator right inlet
  // [+ 0] is identity, needed to create a separate outlet for feedback
  const feedback = add({ name: "+", args: [0], x: x + 80, y });
  wire(clip, feedback);
  wire(feedback, accum, 0, 1); // feed back to accumulator right inlet

  // Initialize accumulator at min on loadbang
  y += SPACING;
  const loadbang = add({ name: "loadbang", args: [], x: x + 80, y });
  y += SPACING;
  const initMsg = add({ type: "msg", args: [min], x: x + 80, y });
  wire(loadbang, initMsg);
  wire(initMsg, accum, 0, 1); // set initial value via right inlet
}

/**
 * Build a note trigger chain for buttons (momentary Note On/Off).
 *
 * Trigger mode (controlType !== "toggle"):
 *   [notein CH] → [stripnote] → [select NOTE] → [send busName]
 *
 * Toggle mode (controlType === "toggle"):
 *   [notein CH] → [stripnote] → [select NOTE] → [toggle] → [send busName]
 *
 * [stripnote] filters out Note Off (vel=0), so only Note On triggers the chain.
 */
function buildTriggerChain(
  mapping: ControllerMapping,
  midiChannel: number,
  x: number,
  startY: number,
  add: (node: PatchNodeSpec) => number,
  wire: (from: number, to: number, outlet?: number, inlet?: number) => void,
): void {
  let y = startY;
  const { control, parameter, busName } = mapping;
  const note = control.note!;
  const isToggle = parameter.controlType === "toggle";

  // notein CHANNEL — outputs note number on outlet 0, velocity on outlet 1
  const notein = add({ name: "notein", args: [midiChannel], x, y });
  y += SPACING;

  // stripnote — only passes notes with vel > 0 (filters out Note Off)
  const strip = add({ name: "stripnote", args: [], x, y });
  wire(notein, strip, 0, 0);  // note → stripnote left inlet
  wire(notein, strip, 1, 1);  // velocity → stripnote right inlet
  y += SPACING;

  // select NOTE — matches our target note, outputs bang on match
  const sel = add({ name: "select", args: [note], x, y });
  wire(strip, sel);
  y += SPACING;

  let lastNode = sel;

  if (isToggle) {
    // toggle — alternates between 0 and 1 on each bang
    const toggle = add({ name: "toggle", args: [], x, y });
    wire(sel, toggle);
    lastNode = toggle;
    y += SPACING;
  } else {
    // trigger mode — send a bang
    const bangNode = add({ type: "msg", args: ["bang"], x, y });
    wire(sel, bangNode);
    lastNode = bangNode;
    y += SPACING;
  }

  // Send to bus
  const send = add({ name: "send", args: [busName], x, y });
  wire(lastNode, send);
}

/**
 * Build a Pd patch for MIDI controller routing.
 *
 * Generates appropriate chains based on each mapping's control type:
 * - Absolute CC (faders, pots) → standard scaling chain
 * - Relative CC (encoders) → accumulator chain with feedback
 * - Note trigger (buttons) → notein → select chain
 */
export function buildControllerPatch(
  mappings: ControllerMapping[],
  midiChannel: number,
  deviceLabel?: string,
): PatchSpec {
  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  const add = (node: PatchNodeSpec): number => {
    const idx = nodes.length;
    nodes.push(node);
    return idx;
  };
  const wire = (from: number, to: number, outlet = 0, inlet = 0) => {
    connections.push({ from, outlet, to, inlet });
  };

  // Title
  const title = deviceLabel ? `=== ${deviceLabel.toUpperCase()} CONTROLLER ===` : "=== CONTROLLER ===";
  add({
    type: "text",
    args: [title],
    x: 50,
    y: 10,
  });

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const x = 50 + i * COL_WIDTH;
    const y = 40;

    const { control } = mapping;

    // Label
    add({
      type: "text",
      args: [control.name, "->", mapping.parameter.label],
      x,
      y,
    });

    if (control.inputType === "relative" && control.cc !== undefined) {
      buildRelativeChain(mapping, midiChannel, x, y + 20, add, wire);
    } else if (control.inputType === "trigger" && control.note !== undefined) {
      buildTriggerChain(mapping, midiChannel, x, y + 20, add, wire);
    } else if (control.cc !== undefined) {
      // Default: absolute CC
      buildAbsoluteChain(mapping, midiChannel, x, y + 20, add, wire);
    }
    // else: control has neither usable CC nor note — silently skip.
    // This guards against future device profiles with malformed controls.
  }

  return { nodes, connections };
}
