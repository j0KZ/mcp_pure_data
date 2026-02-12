/**
 * Oscillator module — 4 variants: sine, saw, square, noise.
 */

import type { ModuleResult, PatchNodeSpec, PatchConnectionSpec } from "./types.js";

export type OscillatorVariant = "sine" | "saw" | "square" | "noise";

export function oscillator(
  variant: OscillatorVariant = "sine",
  freq: number = 440,
): ModuleResult {
  switch (variant) {
    case "sine":
      return sineOsc(freq);
    case "saw":
      return sawOsc(freq);
    case "square":
      return squareOsc(freq);
    case "noise":
      return noiseOsc();
  }
}

function sineOsc(freq: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "osc~", args: [freq] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function sawOsc(freq: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "phasor~", args: [freq] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function squareOsc(freq: number): ModuleResult {
  // phasor~ → >~ 0.5 → *~ 2 → -~ 1
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "phasor~", args: [freq] },
    { type: "obj", name: ">~", args: [0.5] },
    { type: "obj", name: "*~", args: [2] },
    { type: "obj", name: "-~", args: [1] },
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
  ];
  return { nodes, connections, inlets: [0], outlets: [3] };
}

function noiseOsc(): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "noise~" },
  ];
  return { nodes, connections: [], inlets: [], outlets: [0] };
}
