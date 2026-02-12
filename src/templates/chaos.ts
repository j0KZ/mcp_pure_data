/**
 * Chaos template — logistic map generators at different speeds.
 *
 * Formula: x(n+1) = r * x * (1-x)
 * With r near 4.0, produces chaotic (non-repeating) output.
 *
 * Maps to: Nonlinearcircuits Triple Sloths
 * Each channel runs at a slightly different rate for uncorrelated modulation.
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateChaosParams } from "./validate-params.js";

export interface ChaosParams {
  outputs?: number; // 1-3 (default 3)
  speed?: number; // 0-1 (default 0.3) → metro rate
  r?: number; // 3.5-4.0 (default 3.99) — chaos parameter
}

const COL_SPACING = 180;
const SPACING = 30;

export function buildChaos(params: ChaosParams = {}): RackableSpec {
  validateChaosParams(params as Record<string, unknown>);

  const outputs = params.outputs ?? 3;
  const speed = params.speed ?? 0.3;
  const r = params.r ?? 3.99;

  // Speed: 0 → 1000ms (very slow), 1 → 10ms (fast)
  const baseMetroMs = Math.round(1000 - speed * 990);

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
  add({
    type: "text",
    args: [`Chaos: ${outputs} outputs, r=${r.toFixed(2)}`],
    x: 50,
    y: 10,
  });

  // ─── Shared Init ────────────────────────────────
  const loadbang = add({ name: "loadbang", x: 50, y: 40 });
  const metroIndices: number[] = [];
  const floatXIndices: number[] = [];
  const multRIndices: number[] = [];

  // Channel names for labeling
  const chNames = ["Apathy", "Torpor", "Inertia"];
  // Initial seeds (offset to avoid correlation)
  const seeds = [0.4, 0.6, 0.25];

  for (let ch = 0; ch < outputs; ch++) {
    const x = 50 + ch * COL_SPACING;
    let y = 70;

    // Channel label
    add({
      type: "text",
      args: ["---", chNames[ch] ?? `Ch${ch + 1}`, "---"],
      x,
      y,
    });
    y += 20;

    // Metro (each channel at different rate for uncorrelated movement)
    // Ch0 = base, Ch1 = base*1.3, Ch2 = base*1.7
    const rateMultiplier = [1, 1.3, 1.7];
    const metroRate = Math.round(baseMetroMs * (rateMultiplier[ch] ?? 1));

    const startMsg = add({ type: "msg", args: [1], x: x + 80, y });
    wire(loadbang, startMsg);

    const metro = add({ name: "metro", args: [metroRate], x, y });
    metroIndices.push(metro);
    wire(startMsg, metro);
    y += SPACING;

    // State storage: float with initial seed
    const floatX = add({ name: "float", args: [seeds[ch]], x, y });
    floatXIndices.push(floatX);
    wire(metro, floatX);
    y += SPACING;

    // Trigger: sends x to both computation paths (right first)
    const trig = add({ name: "t", args: ["f", "f"], x, y });
    wire(floatX, trig);
    y += SPACING;

    // Right outlet (1): compute (1-x)
    const negOne = add({ name: "*", args: [-1], x: x - 50, y });
    wire(trig, negOne, 1);

    const addOne = add({ name: "+", args: [1], x: x - 50, y: y + SPACING });
    wire(negOne, addOne);

    // Left outlet (0): multiply x * (1-x)
    const multXY = add({ name: "*", x, y: y + SPACING });
    wire(trig, multXY, 0); // x to left inlet
    wire(addOne, multXY, 0, 1); // (1-x) to right inlet
    y += SPACING * 2;

    // Multiply by r
    const multR = add({ name: "*", args: [r], x, y });
    multRIndices.push(multR);
    wire(multXY, multR);
    y += SPACING;

    // Store back to float (right inlet)
    wire(multR, floatX, 0, 1);

    // Output display
    const output = add({
      type: "floatatom",
      args: [7, 0, 1, 0, "-", "-", "-"],
      x,
      y,
    });
    wire(multR, output);
  }

  const ports = [];
  for (let ch = 0; ch < outputs; ch++) {
    ports.push(
      { name: `clock_in_${ch + 1}`, type: "control" as const, direction: "input" as const, nodeIndex: floatXIndices[ch], port: 0, ioNodeIndex: metroIndices[ch] },
      { name: `cv${ch + 1}`, type: "control" as const, direction: "output" as const, nodeIndex: multRIndices[ch], port: 0 },
    );
  }

  return { spec: { nodes, connections }, ports };
}
