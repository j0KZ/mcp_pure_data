/**
 * MIDI step sequencer template.
 *
 * Structure: loadbang → metro → counter (float+1+mod) → select → msg boxes → pack → noteout
 * Reference: tests/fixtures/midi-sequencer.pd
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateSequencerParams } from "./validate-params.js";

export interface SequencerParams {
  steps?: number;        // default 8
  bpm?: number;          // default 120
  notes?: number[];      // default C major scale
  midiChannel?: number;  // default 1
  velocity?: number;     // default 100
}

const DEFAULT_NOTES = [60, 62, 64, 65, 67, 69, 71, 72]; // C major scale

export function buildSequencer(params: SequencerParams = {}): RackableSpec {
  validateSequencerParams(params as Record<string, unknown>);
  const steps = params.steps ?? 8;
  const bpm = params.bpm ?? 120;
  const rawNotes = params.notes ?? DEFAULT_NOTES;
  const channel = params.midiChannel ?? 1;
  const velocity = params.velocity ?? 100;
  const intervalMs = Math.round(60000 / bpm);

  // Pad/truncate notes to match steps
  const notes = Array.from({ length: steps }, (_, i) => rawNotes[i % rawNotes.length]);

  // Build select args: 0 1 2 ... steps-1
  const selectArgs = Array.from({ length: steps }, (_, i) => i);

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  let y = 50;
  const dy = 40;
  const x = 50;

  // Node 0: title comment
  nodes.push({ type: "text", args: [`${steps}-step MIDI sequencer at ${bpm} BPM`], x, y: 10 });

  // Node 1: loadbang
  nodes.push({ type: "obj", name: "loadbang", x, y });
  y += dy;

  // Node 2: msg 1 (to start metro)
  nodes.push({ type: "msg", args: [1], x, y });
  y += dy;

  // Node 3: metro
  nodes.push({ type: "obj", name: "metro", args: [intervalMs], x, y });
  y += dy;

  // Node 4: float (counter storage)
  nodes.push({ type: "obj", name: "float", x, y });

  // Node 5: + 1 (increment)
  nodes.push({ type: "obj", name: "+", args: [1], x: x + 70, y });
  y += dy;

  // Node 6: mod steps
  nodes.push({ type: "obj", name: "mod", args: [steps], x, y });
  y += dy;

  // Node 7: select 0 1 2 ... steps-1
  nodes.push({ type: "obj", name: "select", args: selectArgs, x, y });
  y += dy;

  // Nodes 8..8+steps-1: message boxes for each note
  const msgStartIdx = 8;
  for (let i = 0; i < steps; i++) {
    nodes.push({ type: "msg", args: [notes[i]], x: x + i * 70, y });
  }
  y += dy;

  // Node 8+steps: pack (note velocity)
  const packIdx = msgStartIdx + steps;
  nodes.push({ type: "obj", name: "pack", args: [0, velocity], x, y });
  y += dy;

  // Node 8+steps+1: noteout channel
  const noteoutIdx = packIdx + 1;
  nodes.push({ type: "obj", name: "noteout", args: [channel], x, y });

  // --- Connections ---

  // loadbang → msg 1
  connections.push({ from: 1, to: 2 });
  // msg 1 → metro
  connections.push({ from: 2, to: 3 });
  // metro → float
  connections.push({ from: 3, to: 4 });
  // float → + 1
  connections.push({ from: 4, to: 5 });
  // float → mod (pass-through for value)
  connections.push({ from: 4, to: 6 });
  // + 1 → float inlet 1 (store incremented value)
  connections.push({ from: 5, to: 4, inlet: 1 });
  // mod → select
  connections.push({ from: 6, to: 7 });

  // select outlets → msg boxes
  for (let i = 0; i < steps; i++) {
    connections.push({ from: 7, outlet: i, to: msgStartIdx + i });
  }

  // msg boxes → pack
  for (let i = 0; i < steps; i++) {
    connections.push({ from: msgStartIdx + i, to: packIdx });
  }

  // pack → noteout
  connections.push({ from: packIdx, to: noteoutIdx });

  return {
    spec: { title: undefined, nodes, connections },
    ports: [
      { name: "clock_in", type: "control", direction: "input", nodeIndex: 4, port: 0, ioNodeIndex: 3 },
      { name: "note", type: "control", direction: "output", nodeIndex: packIdx, port: 0, ioNodeIndex: noteoutIdx },
    ],
  };
}
