/**
 * Delay module — 2 variants: simple, pingpong.
 */

import type { ModuleResult, PatchNodeSpec, PatchConnectionSpec } from "./types.js";

export type DelayVariant = "simple" | "pingpong";

export interface DelayParams {
  timeMs?: number;    // default 300
  feedback?: number;  // default 0.5
  id?: string;        // unique delay name, default "del"
}

export function delay(
  variant: DelayVariant = "simple",
  params: DelayParams = {},
): ModuleResult {
  const timeMs = params.timeMs ?? 300;
  const feedback = params.feedback ?? 0.5;
  const id = params.id ?? "del";

  switch (variant) {
    case "simple":
      return simpleDelay(timeMs, feedback, id);
    case "pingpong":
      return pingpongDelay(timeMs, feedback, id);
  }
}

/**
 * Simple delay: input → +~ → delwrite~, delread~ → *~ feedback → +~ (loop)
 * Output: delread~ (the delayed signal)
 */
function simpleDelay(timeMs: number, feedback: number, id: string): ModuleResult {
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "+~" },                          // 0: input mixer
    { type: "obj", name: "delwrite~", args: [id, timeMs] }, // 1: write
    { type: "obj", name: "delread~", args: [id, timeMs] },  // 2: read
    { type: "obj", name: "*~", args: [feedback] },         // 3: feedback gain
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },   // +~ → delwrite~
    { from: 2, to: 3 },   // delread~ → *~ feedback
    { from: 3, to: 0 },   // *~ → +~ (feedback loop)
  ];
  // inlet: +~ (node 0), outlet: delread~ (node 2)
  return { nodes, connections, inlets: [0], outlets: [2] };
}

/**
 * Ping-pong delay: two cross-fed delay lines for stereo.
 * Left input → delay L → right output, Right input → delay R → left output
 */
function pingpongDelay(timeMs: number, feedback: number, id: string): ModuleResult {
  const idL = `${id}_L`;
  const idR = `${id}_R`;
  const nodes: PatchNodeSpec[] = [
    { type: "obj", name: "+~" },                              // 0: left mixer
    { type: "obj", name: "delwrite~", args: [idL, timeMs] },  // 1: write left
    { type: "obj", name: "delread~", args: [idL, timeMs] },   // 2: read left
    { type: "obj", name: "*~", args: [feedback] },             // 3: feedback L→R
    { type: "obj", name: "+~" },                              // 4: right mixer
    { type: "obj", name: "delwrite~", args: [idR, timeMs] },  // 5: write right
    { type: "obj", name: "delread~", args: [idR, timeMs] },   // 6: read right
    { type: "obj", name: "*~", args: [feedback] },             // 7: feedback R→L
  ];
  const connections: PatchConnectionSpec[] = [
    { from: 0, to: 1 },   // left +~ → delwrite~ L
    { from: 2, to: 3 },   // delread~ L → *~ → right mixer
    { from: 3, to: 4 },   // feedback L → right +~
    { from: 4, to: 5 },   // right +~ → delwrite~ R
    { from: 6, to: 7 },   // delread~ R → *~ → left mixer
    { from: 7, to: 0 },   // feedback R → left +~ (cross-feed)
  ];
  // inlets: left (0), right (4); outlets: left delread (2), right delread (6)
  return { nodes, connections, inlets: [0, 4], outlets: [2, 6] };
}
