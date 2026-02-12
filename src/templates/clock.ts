/**
 * Clock template — master clock with multiple divided outputs.
 *
 * Structure: loadbang → metro → counter → per-division: mod + sel → output
 * Maps to: ALM Busy Circuits Pamela's NEW Workout
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateClockParams } from "./validate-params.js";

export interface ClockParams {
  bpm?: number; // default 120
  divisions?: number[]; // default [1, 2, 4, 8]
}

const SPACING = 30;

export function buildClock(params: ClockParams = {}): RackableSpec {
  validateClockParams(params as Record<string, unknown>);

  const bpm = params.bpm ?? 120;
  const divisions = (params.divisions as number[] | undefined) ?? [1, 2, 4, 8];
  const intervalMs = Math.round(60000 / bpm);

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

  let y = 40;
  const x = 50;

  // ─── Title ──────────────────────────────────────
  add({
    type: "text",
    args: [`Clock: ${bpm} BPM (${intervalMs}ms)`],
    x,
    y: 10,
  });

  // ─── Master Clock ───────────────────────────────
  const loadbang = add({ name: "loadbang", x, y });
  y += SPACING;

  const startMsg = add({ type: "msg", args: [1], x, y });
  wire(loadbang, startMsg);
  y += SPACING;

  const metro = add({ name: "metro", args: [intervalMs], x, y });
  wire(startMsg, metro);
  y += SPACING;

  // ─── Counter ────────────────────────────────────
  // LCM-based counter to handle all divisions cleanly
  const maxDiv = Math.max(...divisions);
  const counterMod = maxDiv * 16; // Large enough for clean cycling

  const floatNode = add({ name: "float", x, y });
  wire(metro, floatNode);

  const plusOne = add({ name: "+", args: [1], x: x + 70, y });
  wire(floatNode, plusOne);
  y += SPACING;

  const modNode = add({ name: "mod", args: [counterMod], x, y });
  wire(plusOne, modNode);
  wire(modNode, floatNode, 0, 1);
  y += SPACING;

  // ─── Division Outputs ───────────────────────────
  add({ type: "text", args: ["---", "Outputs", "---"], x, y });
  y += 20;

  const outMsgIndices: number[] = [];

  divisions.forEach((div, i) => {
    const divX = x + i * 120;

    // Division label
    const label = div === 1 ? "1/4" : div === 2 ? "1/8" : div === 4 ? "1/16" : `÷${div}`;
    add({ type: "text", args: [label], x: divX, y });

    const modDiv = add({ name: "mod", args: [div], x: divX, y: y + 20 });
    wire(modNode, modDiv);

    const sel = add({ name: "sel", args: [0], x: divX, y: y + 50 });
    wire(modDiv, sel);

    // Output as msg "bang" (clickable)
    const outMsg = add({ type: "msg", args: ["bang"], x: divX, y: y + 80 });
    wire(sel, outMsg);

    outMsgIndices.push(outMsg);
  });

  return {
    spec: { nodes, connections },
    ports: divisions.map((div, i) => ({
      name: `beat_div${div}`,
      type: "control" as const,
      direction: "output" as const,
      nodeIndex: outMsgIndices[i],
      port: 0,
    })),
  };
}
