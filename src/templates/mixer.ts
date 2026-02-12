/**
 * N-channel mixer template.
 *
 * Per channel: inlet~ → *~ (volume) → *~ (mute gate) → summing chain → dac~
 * Volume: floatatom 0-1, initialized to 0.8 via loadbang.
 * Mute: toggle 0/1, initialized to 1 (unmuted) via loadbang.
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { RackableSpec, PortInfo, ParameterDescriptor } from "./port-info.js";
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

  // Per channel: 7 nodes (inlet~, loadbang, msg 0.8, floatatom, *~ volume, *~ mute, msg 1)
  const NODES_PER_CH = 7;
  const channelStartIdx = 1;
  const inletIndices: number[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const x = 50 + ch * 120;
    const baseY = 50;

    const chBase = channelStartIdx + ch * NODES_PER_CH;

    // [0] inlet~
    inletIndices.push(nodes.length);
    nodes.push({ type: "obj", name: "inlet~", x, y: baseY });

    // [1] loadbang → msg 0.8 → floatatom (initialize volume)
    nodes.push({ type: "obj", name: "loadbang", x: x + 60, y: baseY });
    // [2] msg 0.8
    nodes.push({ type: "msg", args: [0.8], x: x + 60, y: baseY + 20 });

    // [3] floatatom for volume (width 5, range 0-1)
    nodes.push({
      type: "floatatom",
      args: [5, 0, 1, 0, "-", "-", "-"],
      x,
      y: baseY + 40,
    });

    // [4] *~ for volume scaling
    nodes.push({ type: "obj", name: "*~", x, y: baseY + 80 });

    // [5] *~ for mute gate (0 = muted, 1 = unmuted)
    nodes.push({ type: "obj", name: "*~", x, y: baseY + 120 });

    // [6] msg 1 — mute initialization (unmuted)
    nodes.push({ type: "msg", args: [1], x: x + 60, y: baseY + 100 });

    // Volume init chain: loadbang → msg 0.8 → floatatom
    connections.push({ from: chBase + 1, to: chBase + 2 });
    connections.push({ from: chBase + 2, to: chBase + 3 });
    // Audio chain: inlet~ → *~ volume → *~ mute
    connections.push({ from: chBase, to: chBase + 4 });
    connections.push({ from: chBase + 3, to: chBase + 4, inlet: 1 });
    connections.push({ from: chBase + 4, to: chBase + 5 });
    // Mute init chain: loadbang → msg 1 → *~ mute inlet 1
    connections.push({ from: chBase + 1, to: chBase + 6 });
    connections.push({ from: chBase + 6, to: chBase + 5, inlet: 1 });
  }

  // Summing chain: chained +~ nodes
  // First +~ takes channel 0 and channel 1 outputs
  // Each subsequent +~ takes previous sum + next channel
  const sumStartIdx = channelStartIdx + channels * NODES_PER_CH;
  let dacIdx: number;
  let lastSumIdx: number;

  // Helper: get the *~ mute (output) node index for a given channel
  const chOutIdx = (ch: number) => channelStartIdx + ch * NODES_PER_CH + 5;

  if (channels === 1) {
    // Single channel: no summing needed, go direct to dac~
    dacIdx = sumStartIdx;
    lastSumIdx = chOutIdx(0); // *~ of channel 0 is the "last sum"
    nodes.push({ type: "obj", name: "dac~", x: 50, y: 50 + 160 });

    connections.push({ from: chOutIdx(0), to: dacIdx });
    connections.push({ from: chOutIdx(0), to: dacIdx, inlet: 1 });
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
    connections.push({ from: chOutIdx(0), to: firstSumIdx });
    connections.push({ from: chOutIdx(1), to: firstSumIdx, inlet: 1 });

    // Subsequent +~: previous sum + next channel
    for (let i = 2; i < channels; i++) {
      const prevSumIdx = sumStartIdx + i - 2;
      const curSumIdx = sumStartIdx + i - 1;
      connections.push({ from: prevSumIdx, to: curSumIdx });
      connections.push({ from: chOutIdx(i), to: curSumIdx, inlet: 1 });
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

  // ─── Parameters (controller integration) ─────────
  const parameters: ParameterDescriptor[] = [];
  for (let ch = 0; ch < channels; ch++) {
    parameters.push({
      name: `volume_ch${ch + 1}`,
      label: `Channel ${ch + 1} Volume`,
      min: 0,
      max: 1,
      default: 0.8,
      unit: "",
      curve: "linear",
      nodeIndex: channelStartIdx + ch * NODES_PER_CH + 3, // floatatom
      inlet: 0,
      category: "amplitude",
    });
  }
  for (let ch = 0; ch < channels; ch++) {
    parameters.push({
      name: `mute_ch${ch + 1}`,
      label: `Channel ${ch + 1} Mute`,
      min: 0,
      max: 1,
      default: 1, // 1 = unmuted
      unit: "",
      curve: "linear",
      nodeIndex: channelStartIdx + ch * NODES_PER_CH + 5, // *~ mute gate
      inlet: 1,
      category: "transport",
      controlType: "toggle",
    });
  }

  return { spec: { title: undefined, nodes, connections }, ports, parameters };
}
