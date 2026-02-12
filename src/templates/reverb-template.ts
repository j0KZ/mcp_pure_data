/**
 * Reverb effect template — standalone patch with audio I/O.
 *
 * Composition: adc~ → reverb module → wet/dry mix → dac~
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { ModuleResult } from "./modules/types.js";
import type { RackableSpec } from "./port-info.js";
import { reverb, type ReverbVariant } from "./modules/reverb.js";
import { validateReverbParams } from "./validate-params.js";

export interface ReverbTemplateParams {
  variant?: ReverbVariant;  // default "simple"
  roomSize?: number;        // 0-1, default 0.5
  damping?: number;         // 0-1, default 0.5
  wetDry?: number;          // 0-1, default 0.3
}

export function buildReverb(params: ReverbTemplateParams = {}): RackableSpec {
  validateReverbParams(params as Record<string, unknown>);
  const variant = params.variant ?? "simple";
  const roomSize = params.roomSize ?? 0.5;
  const dampingVal = params.damping ?? 0.5;
  const wetDry = params.wetDry ?? 0.3;

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  // Node 0: title
  nodes.push({ type: "text", args: [`Reverb: ${variant} (wet ${Math.round(wetDry * 100)}%)`], x: 50, y: 10 });

  // Node 1: adc~ (audio input)
  nodes.push({ type: "obj", name: "adc~", x: 50, y: 50 });

  // Get the reverb module
  const revMod = reverb(variant, { roomSize, damping: dampingVal, id: "rev" });

  // Insert reverb module nodes starting at index 2
  const revOffset = 2;
  for (const node of revMod.nodes) {
    nodes.push(node);
  }

  // Add reverb internal connections (offset by revOffset)
  for (const conn of revMod.connections) {
    connections.push({
      from: conn.from + revOffset,
      outlet: conn.outlet ?? 0,
      to: conn.to + revOffset,
      inlet: conn.inlet ?? 0,
    });
  }

  // Wet/dry mix nodes
  const mixOffset = revOffset + revMod.nodes.length;
  const dryIdx = mixOffset;       // *~ (1-wetDry) — dry path
  const wetIdx = mixOffset + 1;   // *~ wetDry — wet path
  const sumIdx = mixOffset + 2;   // +~ — sum
  const dacIdx = mixOffset + 3;   // dac~

  nodes.push({ type: "obj", name: "*~", args: [+(1 - wetDry).toFixed(2)], x: 50 });  // dry
  nodes.push({ type: "obj", name: "*~", args: [+wetDry.toFixed(2)], x: 200 });         // wet
  nodes.push({ type: "obj", name: "+~", x: 50 });                                       // sum
  nodes.push({ type: "obj", name: "dac~", x: 50 });                                     // output

  // adc~ → reverb input(s)
  for (const inlet of revMod.inlets) {
    connections.push({ from: 1, to: inlet + revOffset });
  }

  // adc~ → dry path
  connections.push({ from: 1, to: dryIdx });

  // reverb output → wet path
  const revOutGlobal = revMod.outlets[0] + revOffset;
  connections.push({ from: revOutGlobal, to: wetIdx });

  // dry → sum inlet 0, wet → sum inlet 1
  connections.push({ from: dryIdx, to: sumIdx });
  connections.push({ from: wetIdx, to: sumIdx, inlet: 1 });

  // sum → dac~ (left + right)
  connections.push({ from: sumIdx, to: dacIdx });
  connections.push({ from: sumIdx, to: dacIdx, inlet: 1 });

  return {
    spec: { title: undefined, nodes, connections },
    ports: [
      { name: "audio_in", type: "audio", direction: "input", nodeIndex: dryIdx, port: 0, ioNodeIndex: 1 },
      { name: "audio", type: "audio", direction: "output", nodeIndex: sumIdx, port: 0, ioNodeIndex: dacIdx },
    ],
  };
}
