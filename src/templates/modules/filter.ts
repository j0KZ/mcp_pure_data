/**
 * Filter module — 5 variants: lowpass, highpass, bandpass, moog, korg.
 */

import type { ModuleResult, PatchNodeSpec, PatchConnectionSpec } from "./types.js";

export type FilterVariant = "lowpass" | "highpass" | "bandpass" | "moog" | "korg";

export function filter(
  variant: FilterVariant = "lowpass",
  cutoff: number = 1000,
): ModuleResult {
  switch (variant) {
    case "lowpass":
      return lowpassFilter(cutoff);
    case "highpass":
      return highpassFilter(cutoff);
    case "bandpass":
      return bandpassFilter(cutoff);
    case "moog":
      return moogFilter(cutoff);
    case "korg":
      return korgFilter(cutoff);
  }
}

function lowpassFilter(cutoff: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "lop~", args: [cutoff] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function highpassFilter(cutoff: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "hip~", args: [cutoff] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function bandpassFilter(cutoff: number): ModuleResult {
  // bp~ has 3 inlets: signal, center freq, Q
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "bp~", args: [cutoff, 5] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function moogFilter(cutoff: number): ModuleResult {
  // bob~ has 4 inlets: signal, cutoff, resonance, saturation
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "bob~", args: [cutoff, 2, 1] },
  ];
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}

function korgFilter(cutoff: number): ModuleResult {
  // MS-20 style: hip~ → lop~
  // hip~ cutoff = cutoff * 0.1, lop~ cutoff = cutoff
  const hpCutoff = Math.round(cutoff * 0.1);
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "hip~", args: [hpCutoff] },
    { type: "obj", name: "lop~", args: [cutoff] },
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },
  ];
  return { nodes, connections, inlets: [0], outlets: [1] };
}
