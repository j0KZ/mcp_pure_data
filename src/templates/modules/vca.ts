/**
 * VCA (Voltage Controlled Amplifier) module.
 * Simply a *~ with audio and gain inputs.
 */

import type { ModuleResult, PatchNodeSpec } from "./types.js";

export function vca(gain: number = 0.3): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "*~", args: [gain] },
  ];
  // Inlets: [0] = audio (inlet 0 of *~), gain control (inlet 1 of *~)
  // Outlets: [0] = audio output
  return { nodes, connections: [], inlets: [0], outlets: [0] };
}
