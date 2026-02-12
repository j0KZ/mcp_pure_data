/**
 * MATHS template — dual function generator / envelope / LFO.
 *
 * Per channel:
 *   Gate (floatatom 0/1) → sel 1 0 → rise/fall msgs → vline~
 *   vline~ → threshold~ → EOC (end of cycle) output
 *   Cycle mode: EOC retriggers the gate → LFO behavior
 *
 * Maps to: Make Noise MATHS
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateMathsParams } from "./validate-params.js";

export interface MathsParams {
  channels?: number; // 1-2 (default 2)
  rise?: number; // ms (default 100)
  fall?: number; // ms (default 200)
  cycle?: boolean; // default false (LFO mode)
  outputRange?: "unipolar" | "bipolar"; // default "unipolar"
}

const COL_SPACING = 250;
const SPACING = 30;

export function buildMaths(params: MathsParams = {}): RackableSpec {
  validateMathsParams(params as Record<string, unknown>);

  const channels = params.channels ?? 2;
  const rise = params.rise ?? 100;
  const fall = params.fall ?? 200;
  const cycle = params.cycle ?? false;
  const outputRange = params.outputRange ?? "unipolar";

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

  // ─── Title ──────────────────────────────────────
  const modeStr = cycle ? "LFO" : "ENV";
  const rangeStr = outputRange === "bipolar" ? "bipolar" : "unipolar";
  add({
    type: "text",
    args: [`MATHS: ${channels}ch ${modeStr} (${rangeStr})`],
    x: 50,
    y: 10,
  });

  const gateIndices: number[] = [];
  const outputNodeIndices: number[] = [];
  const outletIndices: number[] = [];
  const eocOutIndices: number[] = [];

  for (let ch = 0; ch < channels; ch++) {
    const x = 50 + ch * COL_SPACING;
    let y = 40;

    // Channel label
    add({
      type: "text",
      args: ["---", `Channel ${ch + 1}`, "---"],
      x,
      y,
    });
    y += 20;

    // Gate label
    add({ type: "text", args: ["Gate", "(0/1)"], x, y });
    y += 20;

    // Gate input (floatatom 0-1)
    const gate = add({
      type: "floatatom",
      args: [3, 0, 1, 0, "-", "-", "-"],
      x,
      y,
    });
    gateIndices.push(gate);
    y += SPACING;

    // sel 1 0
    const sel = add({ name: "sel", args: [1, 0], x, y });
    wire(gate, sel);
    y += SPACING;

    // Rise message (gate ON → ramp to 1)
    const riseMsg = add({
      type: "msg",
      args: [1, rise],
      x: x - 40,
      y,
    });
    wire(sel, riseMsg, 0); // sel outlet 0 = matched 1

    // Fall message (gate OFF → ramp to 0)
    const fallMsg = add({
      type: "msg",
      args: [0, fall],
      x: x + 80,
      y,
    });
    wire(sel, fallMsg, 1); // sel outlet 1 = matched 0
    y += 25;

    // Envelope params label
    add({
      type: "text",
      args: [`R=${rise}ms`, `F=${fall}ms`],
      x: x - 40,
      y,
    });
    y += 20;

    // vline~ (sample-accurate envelope)
    const vline = add({ name: "vline~", x, y });
    wire(riseMsg, vline);
    wire(fallMsg, vline);
    y += SPACING;

    // Output scaling
    let outputNode: number;
    if (outputRange === "bipolar") {
      // 0..1 → -1..1: *~ 2 → -~ 1
      const mul2 = add({ name: "*~", args: [2], x, y });
      wire(vline, mul2);
      y += SPACING;

      const sub1 = add({ name: "-~", args: [1], x, y });
      wire(mul2, sub1);
      outputNode = sub1;
    } else {
      outputNode = vline;
    }
    y += SPACING;

    // Output label
    add({ type: "text", args: ["Output ~"], x, y });
    y += 20;

    // outlet~ for connecting to other patches
    const outlet = add({ name: "outlet~", x, y });
    wire(outputNode, outlet);
    outputNodeIndices.push(outputNode);
    outletIndices.push(outlet);
    y += SPACING;

    // ─── EOC Detection ────────────────────────────
    add({ type: "text", args: ["EOC"], x: x + 100, y: y - 20 });

    // threshold~ detects when envelope completes rise (crosses 0.5 going up)
    const threshold = add({
      name: "threshold~",
      args: [0.5, 50],
      x: x + 100,
      y,
    });
    wire(vline, threshold);
    y += SPACING;

    // EOC output
    const eocOut = add({ type: "msg", args: ["bang"], x: x + 100, y });
    wire(threshold, eocOut);
    eocOutIndices.push(eocOut);

    // Cycle mode: EOC → delay 1ms → send 0 to gate (triggers fall, then re-rise)
    if (cycle) {
      y += SPACING;

      const delayNode = add({ name: "delay", args: [fall + 10], x, y });
      wire(eocOut, delayNode);

      const oneMsg = add({ type: "msg", args: [1], x, y: y + SPACING });
      wire(delayNode, oneMsg);
      wire(oneMsg, gate);

      // Auto-start: loadbang → 1 → gate
      const autoStart = add({ name: "loadbang", x: x + 80, y: 40 });
      const autoMsg = add({ type: "msg", args: [1], x: x + 80, y: 70 });
      wire(autoStart, autoMsg);
      wire(autoMsg, gate);
    }
  }

  const ports = [];
  for (let ch = 0; ch < channels; ch++) {
    ports.push(
      { name: `gate${ch + 1}`, type: "control" as const, direction: "input" as const, nodeIndex: gateIndices[ch], port: 0 },
      { name: `envelope${ch + 1}`, type: "audio" as const, direction: "output" as const, nodeIndex: outputNodeIndices[ch], port: 0, ioNodeIndex: outletIndices[ch] },
      { name: `eoc${ch + 1}`, type: "control" as const, direction: "output" as const, nodeIndex: eocOutIndices[ch], port: 0 },
    );
  }

  return { spec: { nodes, connections }, ports };
}
