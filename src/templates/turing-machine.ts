/**
 * Turing Machine template — random looping sequencer.
 *
 * Uses a table to store a sequence of float values (0-1).
 * Each step reads from the table and outputs a scaled MIDI note.
 * With probability P, the current step is replaced with a new random value.
 *
 * probability=0 → perfect loop (never mutates)
 * probability=1 → pure random (always replaces)
 *
 * Maps to: Music Thing Modular Turing Machine Mk II + Voltages + Pulses
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateTuringMachineParams } from "./validate-params.js";

export interface TuringMachineParams {
  length?: number; // 2-16 (default 8)
  probability?: number; // 0-1 (default 0.5)
  bpm?: number; // default 120
  range?: number; // MIDI note range (default 24)
  offset?: number; // base MIDI note (default 48)
}

const SPACING = 30;

export function buildTuringMachine(
  params: TuringMachineParams = {},
): RackableSpec {
  validateTuringMachineParams(params as Record<string, unknown>);

  const length = params.length ?? 8;
  const probability = params.probability ?? 0.5;
  const bpm = params.bpm ?? 120;
  const range = params.range ?? 24;
  const offset = params.offset ?? 48;

  const intervalMs = Math.round(60000 / bpm);
  const tableName = "turing_seq";
  const probThreshold = Math.round(probability * 100);

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
  const xLeft = 50; // Sequence read path
  const xRight = 280; // Mutation path

  // ─── Title ──────────────────────────────────────
  add({
    type: "text",
    args: [
      `Turing Machine: len=${length} p=${probability} ${bpm}BPM`,
    ],
    x: xLeft,
    y: 10,
  });

  // ─── Table ──────────────────────────────────────
  add({ name: "table", args: [tableName, length], x: xLeft, y });
  y += SPACING;

  // ─── Clock ──────────────────────────────────────
  const loadbang = add({ name: "loadbang", x: xLeft, y });
  y += SPACING;

  const startMsg = add({ type: "msg", args: [1], x: xLeft, y });
  wire(loadbang, startMsg);
  y += SPACING;

  const metro = add({ name: "metro", args: [intervalMs], x: xLeft, y });
  wire(startMsg, metro);
  y += SPACING;

  // ─── Counter ────────────────────────────────────
  const floatNode = add({ name: "float", x: xLeft, y });
  wire(metro, floatNode);

  const plusOne = add({
    name: "+",
    args: [1],
    x: xLeft + 70,
    y,
  });
  wire(floatNode, plusOne);
  y += SPACING;

  const modNode = add({ name: "mod", args: [length], x: xLeft, y });
  wire(plusOne, modNode);
  wire(modNode, floatNode, 0, 1);
  y += SPACING;

  // ─── Split: read path + mutation path ───────────
  // t f f: outlet 0 (left) = to mutation, outlet 1 (right) = to read
  // Right fires first in Pd → read happens before potential write
  const trig = add({ name: "t", args: ["f", "f"], x: xLeft, y });
  wire(modNode, trig);
  y += SPACING;

  // ─── Read Path (left column) ────────────────────
  add({
    type: "text",
    args: ["---", "Output", "---"],
    x: xLeft,
    y,
  });
  y += 20;

  const tabread = add({
    name: "tabread",
    args: [tableName],
    x: xLeft,
    y,
  });
  wire(trig, tabread, 1); // Right outlet fires first → read
  y += SPACING;

  // Scale: tabread (0-1) → * range → + offset → MIDI note
  const mulRange = add({ name: "*", args: [range], x: xLeft, y });
  wire(tabread, mulRange);
  y += SPACING;

  const addOffset = add({ name: "+", args: [offset], x: xLeft, y });
  wire(mulRange, addOffset);
  y += SPACING;

  // Round to integer MIDI note
  const intNode = add({ name: "int", x: xLeft, y });
  wire(addOffset, intNode);
  y += SPACING;

  // Output display
  const output = add({
    type: "floatatom",
    args: [5, 0, 127, 0, "-", "-", "-"],
    x: xLeft,
    y,
  });
  wire(intNode, output);

  // ─── Mutation Path (right column) ───────────────
  let my = trig ? nodes[trig].y! + SPACING : 200;

  add({
    type: "text",
    args: ["---", "Mutation", "---"],
    x: xRight,
    y: my,
  });
  my += 20;

  // Random 0-99 (to check against probability threshold)
  const randCheck = add({
    name: "random",
    args: [100],
    x: xRight,
    y: my,
  });
  wire(trig, randCheck, 0); // Left outlet → mutation path
  my += SPACING;

  // moses splits: left (< threshold) = MUTATE, right (>= threshold) = KEEP
  const moses = add({
    name: "moses",
    args: [probThreshold],
    x: xRight,
    y: my,
  });
  wire(randCheck, moses);
  my += SPACING;

  // Generate new random value (0-999 → /1000 → 0-0.999)
  const randNew = add({
    name: "random",
    args: [1000],
    x: xRight,
    y: my,
  });
  wire(moses, randNew, 0); // Left outlet of moses = below threshold = mutate
  my += SPACING;

  const divThousand = add({ name: "/", args: [1000], x: xRight, y: my });
  wire(randNew, divThousand);
  my += SPACING;

  // Pack: [index, value] for tabwrite
  // index comes from counter (trig left outlet), value from random
  const pack = add({
    name: "pack",
    args: [0, 0],
    x: xRight,
    y: my,
  });
  wire(divThousand, pack, 0, 1); // New value → right inlet
  wire(trig, pack, 0, 0); // Index → left inlet (triggers pack)
  my += SPACING;

  // Write to table
  const tabwrite = add({
    name: "tabwrite",
    args: [tableName],
    x: xRight,
    y: my,
  });
  wire(pack, tabwrite);

  return {
    spec: { nodes, connections },
    ports: [
      { name: "clock_in", type: "control", direction: "input", nodeIndex: floatNode, port: 0, ioNodeIndex: metro },
      { name: "note", type: "control", direction: "output", nodeIndex: intNode, port: 0 },
    ],
  };
}
