/**
 * Output controller Pd patch generator.
 *
 * Generates an _output_controller.pd file with receive → scaling → ctlout
 * chains that route rack parameter changes to external hardware (e.g. MicroFreak).
 *
 * Includes mitigations for USB MIDI instability:
 *   - [change] suppresses redundant values
 *   - [pipe 33] throttles to ~30 Hz
 *
 * Supports bipolar controls (center=64, e.g. MicroFreak CC 26).
 */

import type { PatchNodeSpec, PatchConnectionSpec, PatchSpec } from "../core/serializer.js";
import type { ControllerMapping } from "./types.js";

const COL_WIDTH = 180;
const SPACING = 30;

/**
 * Build a Pd patch for output MIDI controller routing.
 *
 * Each mapping produces a column:
 *   [text label] → [receive busName] → scaling → [change] → [pipe 33] → [ctlout CC CH]
 *
 * For bipolar controls, the range 0..1 maps to 0..127 with center=64.
 * For exponential curves, [pow 3] is inserted before scaling.
 */
export function buildOutputControllerPatch(
  mappings: ControllerMapping[],
  midiChannel: number,
  deviceLabel: string,
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
  add({
    type: "text",
    args: [`=== ${deviceLabel.toUpperCase()} OUTPUT CONTROLLER ===`],
    x: 50,
    y: 10,
  });

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const x = 50 + i * COL_WIDTH;
    let y = 40;

    const { control, parameter, busName } = mapping;
    const cc = control.cc;
    if (cc === undefined) continue;

    // Label
    add({
      type: "text",
      args: [parameter.label, "->", `CC${cc}`, control.name],
      x,
      y,
    });
    y += 20;

    // Receive from bus
    const recv = add({ name: "receive", args: [busName], x, y });
    y += SPACING;

    let lastNode = recv;

    // For bipolar controls (center=64): value arrives as 0..1,
    // scale to 0..127 (same as unipolar) — the device interprets 64 as center.
    // The template's parameter min/max already reflect the full range.

    // Normalize to 0..1 if parameter has min/max range
    // receive bus delivers values in parameter's native range (e.g. 0-20000 Hz for cutoff)
    // We need to map: native range → 0..127 for MIDI CC
    const range = parameter.max - parameter.min;
    if (range !== 0 && (parameter.min !== 0 || parameter.max !== 127)) {
      // Subtract min
      if (parameter.min !== 0) {
        const subMin = add({ name: "-", args: [parameter.min], x, y });
        wire(lastNode, subMin);
        lastNode = subMin;
        y += SPACING;
      }

      // Divide by range to get 0..1
      const normalize = add({ name: "/", args: [range], x, y });
      wire(lastNode, normalize);
      lastNode = normalize;
      y += SPACING;

      // Exponential curve (before scaling to 127)
      if (parameter.curve === "exponential") {
        const pow = add({ name: "pow", args: [3], x, y });
        wire(lastNode, pow);
        lastNode = pow;
        y += SPACING;
      }

      // Scale to 0..127
      const scale = add({ name: "*", args: [127], x, y });
      wire(lastNode, scale);
      lastNode = scale;
      y += SPACING;
    }

    // Clip to valid MIDI range
    const clip = add({ name: "clip", args: [0, 127], x, y });
    wire(lastNode, clip);
    y += SPACING;

    // Suppress redundant values (USB MIDI protection)
    const change = add({ name: "change", args: [], x, y });
    wire(clip, change);
    y += SPACING;

    // Throttle to ~30 Hz (USB MIDI flooding protection)
    const throttle = add({ name: "pipe", args: [33], x, y });
    wire(change, throttle);
    y += SPACING;

    // Send to hardware
    const ctlout = add({ name: "ctlout", args: [cc, midiChannel], x, y });
    wire(throttle, ctlout);
  }

  // Panic section (rightmost column)
  if (mappings.length > 0) {
    const panicX = 50 + mappings.length * COL_WIDTH;

    add({
      type: "text",
      args: ["=== PANIC ==="],
      x: panicX,
      y: 40,
    });

    const panicRecv = add({ name: "receive", args: ["__panic"], x: panicX, y: 70 });

    // All Notes Off (CC 123)
    const allNotesOff = add({ type: "msg", args: [123], x: panicX, y: 100 });
    wire(panicRecv, allNotesOff);

    const ctlout123 = add({ name: "ctlout", args: [123, midiChannel], x: panicX, y: 130 });
    wire(allNotesOff, ctlout123);

    // All Sound Off (CC 120)
    const allSoundOff = add({ type: "msg", args: [120], x: panicX + 80, y: 100 });
    wire(panicRecv, allSoundOff);

    const ctlout120 = add({ name: "ctlout", args: [120, midiChannel], x: panicX + 80, y: 130 });
    wire(allSoundOff, ctlout120);
  }

  return { nodes, connections };
}
