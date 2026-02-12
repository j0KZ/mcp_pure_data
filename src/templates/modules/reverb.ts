/**
 * Reverb module — 2 variants: schroeder (simplified), simple.
 */

import type { ModuleResult, PatchNodeSpec, PatchConnectionSpec } from "./types.js";

export type ReverbVariant = "schroeder" | "simple";

export interface ReverbParams {
  roomSize?: number;  // 0-1, default 0.5
  damping?: number;   // 0-1, default 0.5
  id?: string;        // unique prefix for delay names, default "rev"
}

export function reverb(
  variant: ReverbVariant = "simple",
  params: ReverbParams = {},
): ModuleResult {
  const roomSize = params.roomSize ?? 0.5;
  const damping = params.damping ?? 0.5;
  const id = params.id ?? "rev";

  switch (variant) {
    case "schroeder":
      return schroederReverb(roomSize, damping, id);
    case "simple":
      return simpleReverb(roomSize, damping, id);
  }
}

/**
 * Simplified Schroeder: 2 parallel comb filters + 1 series allpass.
 *
 * Per comb (5 nodes): +~ → delwrite~, delread~ → *~ → lop~ → +~ (feedback)
 * Allpass (4 nodes): delwrite~, delread~ → *~ → +~ (with input summed)
 * Summing (1 node): +~ to sum comb outputs
 * Total: 15 nodes
 */
function schroederReverb(roomSize: number, damping: number, id: string): ModuleResult {
  const scale = 0.5 + roomSize;
  const comb1Time = Math.round(29.7 * scale);
  const comb2Time = Math.round(37.1 * scale);
  const apTime = 5;
  const fbGain = 0.7;
  const apGain = 0.7;
  const dampHz = Math.round(5000 * (1 - damping));

  const nodes: PatchNodeSpec[] = [
    // Comb 1 (nodes 0-4)
    { type: "obj", name: "+~" },                                       // 0: input + feedback
    { type: "obj", name: "delwrite~", args: [`${id}_c1`, comb1Time] }, // 1: write
    { type: "obj", name: "delread~", args: [`${id}_c1`, comb1Time] },  // 2: read
    { type: "obj", name: "*~", args: [fbGain] },                       // 3: feedback gain
    { type: "obj", name: "lop~", args: [dampHz] },                     // 4: damping

    // Comb 2 (nodes 5-9)
    { type: "obj", name: "+~" },                                       // 5: input + feedback
    { type: "obj", name: "delwrite~", args: [`${id}_c2`, comb2Time] }, // 6: write
    { type: "obj", name: "delread~", args: [`${id}_c2`, comb2Time] },  // 7: read
    { type: "obj", name: "*~", args: [fbGain] },                       // 8: feedback gain
    { type: "obj", name: "lop~", args: [dampHz] },                     // 9: damping

    // Summing (node 10)
    { type: "obj", name: "+~" },                                       // 10: sum combs

    // Allpass (nodes 11-14)
    { type: "obj", name: "delwrite~", args: [`${id}_ap`, apTime] },    // 11: write
    { type: "obj", name: "delread~", args: [`${id}_ap`, apTime] },     // 12: read
    { type: "obj", name: "*~", args: [apGain] },                       // 13: gain
    { type: "obj", name: "+~" },                                       // 14: output sum
  ];

  const connections: PatchConnectionSpec[] = [
    // Comb 1 internal
    { from: 0, to: 1 },     // +~ → delwrite~
    { from: 2, to: 3 },     // delread~ → *~
    { from: 3, to: 4 },     // *~ → lop~
    { from: 4, to: 0 },     // lop~ → +~ (feedback loop)

    // Comb 2 internal
    { from: 5, to: 6 },     // +~ → delwrite~
    { from: 7, to: 8 },     // delread~ → *~
    { from: 8, to: 9 },     // *~ → lop~
    { from: 9, to: 5 },     // lop~ → +~ (feedback loop)

    // Sum comb outputs
    { from: 2, to: 10 },            // comb1 delread~ → +~
    { from: 7, to: 10, inlet: 1 },  // comb2 delread~ → +~ inlet 1

    // Sum → allpass
    { from: 10, to: 11 },    // sum → delwrite~ ap
    { from: 10, to: 14 },    // sum → +~ output (direct path)
    { from: 12, to: 13 },    // delread~ → *~ gain
    { from: 13, to: 14, inlet: 1 }, // *~ → +~ outlet (delayed path)
  ];

  // Input feeds both combs; output is allpass +~
  // Inlets: [0] = comb1 +~, [5] = comb2 +~ (both need same input)
  // For simplicity, expose single inlet [0]; template wires input to both combs
  return { nodes, connections, inlets: [0, 5], outlets: [14] };
}

/**
 * Simple reverb: single delay with feedback.
 */
function simpleReverb(roomSize: number, _damping: number, id: string): ModuleResult {
  const timeMs = Math.round(40 * (0.5 + roomSize));
  const fbGain = 0.6;
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "+~" },                              // 0: input + feedback
    { type: "obj", name: "delwrite~", args: [id, timeMs] },   // 1: write
    { type: "obj", name: "delread~", args: [id, timeMs] },    // 2: read
    { type: "obj", name: "*~", args: [fbGain] },               // 3: feedback
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },   // +~ → delwrite~
    { from: 2, to: 3 },   // delread~ → *~
    { from: 3, to: 0 },   // *~ → +~ (feedback loop)
  ];
  return { nodes, connections, inlets: [0], outlets: [2] };
}
