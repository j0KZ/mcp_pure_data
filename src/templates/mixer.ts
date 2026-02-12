/**
 * N-channel mixer template.
 *
 * Per channel: inlet~ → floatatom (volume 0-1) → *~ (scaling)
 * All channels summed via chained +~ → dac~
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { RackableSpec, PortInfo } from "./port-info.js";
import { validateMixerParams } from "./validate-params.js";

export interface MixerParams {
  channels?: number;  // default 4, max 16
  stereo?: boolean;   // default true (unused for now — always mono sum to stereo out)
}

export function buildMixer(params: MixerParams = {}): RackableSpec {
  validateMixerParams(params as Record<string, unknown>);
  const channels = Math.min(Math.max(params.channels ?? 4, 1), 16);

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  // Node 0: title
  nodes.push({
    type: "text",
    args: [`${channels}-channel mixer`],
    x: 50,
    y: 10,
  });

  // Per channel: 3 nodes (inlet~, floatatom, *~)
  const channelStartIdx = 1;
  const inletIndices: number[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const x = 50 + ch * 120;
    const baseY = 50;

    // inlet~
    inletIndices.push(nodes.length);
    nodes.push({ type: "obj", name: "inlet~", x, y: baseY });

    // floatatom for volume (width 5, range 0-1)
    nodes.push({
      type: "floatatom",
      args: [5, 0, 1, 0, "-", "-", "-", 0],
      x,
      y: baseY + 40,
    });

    // *~ for volume scaling
    nodes.push({ type: "obj", name: "*~", x, y: baseY + 80 });

    const chBase = channelStartIdx + ch * 3;
    // inlet~ → *~ inlet 0
    connections.push({ from: chBase, to: chBase + 2 });
    // floatatom → *~ inlet 1
    connections.push({ from: chBase + 1, to: chBase + 2, inlet: 1 });
  }

  // Summing chain: chained +~ nodes
  // First +~ takes channel 0 and channel 1 outputs
  // Each subsequent +~ takes previous sum + next channel
  const sumStartIdx = channelStartIdx + channels * 3;
  let dacIdx: number;
  let lastSumIdx: number;

  if (channels === 1) {
    // Single channel: no summing needed, go direct to dac~
    dacIdx = sumStartIdx;
    lastSumIdx = channelStartIdx + 2; // *~ of channel 0 is the "last sum"
    nodes.push({ type: "obj", name: "dac~", x: 50, y: 50 + 160 });

    const ch0Out = channelStartIdx + 2; // *~ of channel 0
    connections.push({ from: ch0Out, to: dacIdx });
    connections.push({ from: ch0Out, to: dacIdx, inlet: 1 });
  } else {
    // Multiple channels: sum them
    const numSumNodes = channels - 1;
    for (let i = 0; i < numSumNodes; i++) {
      nodes.push({
        type: "obj",
        name: "+~",
        x: 50,
        y: 50 + 120 + i * 40,
      });
    }

    // First +~: channel 0 + channel 1
    const firstSumIdx = sumStartIdx;
    const ch0Out = channelStartIdx + 2; // *~ of channel 0
    const ch1Out = channelStartIdx + 3 + 2; // *~ of channel 1
    connections.push({ from: ch0Out, to: firstSumIdx });
    connections.push({ from: ch1Out, to: firstSumIdx, inlet: 1 });

    // Subsequent +~: previous sum + next channel
    for (let i = 2; i < channels; i++) {
      const prevSumIdx = sumStartIdx + i - 2;
      const curSumIdx = sumStartIdx + i - 1;
      const chOut = channelStartIdx + i * 3 + 2; // *~ of channel i
      connections.push({ from: prevSumIdx, to: curSumIdx });
      connections.push({ from: chOut, to: curSumIdx, inlet: 1 });
    }

    // dac~ after all summing
    dacIdx = sumStartIdx + numSumNodes;
    nodes.push({
      type: "obj",
      name: "dac~",
      x: 50,
      y: 50 + 120 + numSumNodes * 40 + 40,
    });

    // Last sum → dac~ (left + right)
    lastSumIdx = sumStartIdx + numSumNodes - 1;
    connections.push({ from: lastSumIdx, to: dacIdx });
    connections.push({ from: lastSumIdx, to: dacIdx, inlet: 1 });
  }

  const ports: PortInfo[] = [];
  for (let ch = 0; ch < channels; ch++) {
    ports.push({
      name: `ch${ch + 1}`,
      type: "audio",
      direction: "input",
      nodeIndex: inletIndices[ch],
      port: 0,
      ioNodeIndex: inletIndices[ch],
    });
  }
  ports.push({
    name: "audio",
    type: "audio",
    direction: "output",
    nodeIndex: lastSumIdx,
    port: 0,
    ioNodeIndex: dacIdx,
  });

  return { spec: { title: undefined, nodes, connections }, ports };
}
