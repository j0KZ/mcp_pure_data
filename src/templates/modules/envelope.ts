/**
 * Envelope module — 3 variants: adsr, ar, decay.
 *
 * Each variant uses a multi-segment message to line~.
 * Pd message syntax uses \, (escaped comma) to chain segments.
 */

import type { ModuleResult, PatchNodeSpec, PatchConnectionSpec } from "./types.js";

export type EnvelopeVariant = "adsr" | "ar" | "decay";

export interface EnvelopeParams {
  attack?: number;   // ms, default 10
  decay?: number;    // ms, default 100
  sustain?: number;  // 0-1, default 0.7
  release?: number;  // ms, default 200
}

export function envelope(
  variant: EnvelopeVariant = "adsr",
  params: EnvelopeParams = {},
): ModuleResult {
  const attack = params.attack ?? 10;
  const decay = params.decay ?? 100;
  const sustain = params.sustain ?? 0.7;
  const release = params.release ?? 200;

  switch (variant) {
    case "adsr":
      return adsrEnvelope(attack, decay, sustain, release);
    case "ar":
      return arEnvelope(attack, release);
    case "decay":
      return decayEnvelope(decay);
  }
}

/**
 * ADSR: 0, 1 attack, sustain decay, 0 release
 * On bang: reset to 0, ramp to 1 (attack), ramp to sustain (decay), ramp to 0 (release)
 */
function adsrEnvelope(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "msg", args: [0, "\\,", 1, attack, "\\,", sustain, decay, "\\,", 0, release] },
    { type: "obj", name: "line~" },
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },
  ];
  return { nodes, connections, inlets: [0], outlets: [1] };
}

/**
 * AR: 0, 1 attack, 0 release
 */
function arEnvelope(attack: number, release: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "msg", args: [0, "\\,", 1, attack, "\\,", 0, release] },
    { type: "obj", name: "line~" },
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },
  ];
  return { nodes, connections, inlets: [0], outlets: [1] };
}

/**
 * Decay: 1, 0 decay
 */
function decayEnvelope(decay: number): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "msg", args: [1, "\\,", 0, decay] },
    { type: "obj", name: "line~" },
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },
  ];
  return { nodes, connections, inlets: [0], outlets: [1] };
}
