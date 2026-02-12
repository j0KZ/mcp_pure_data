/**
 * Synth template — production-quality Pd synthesizer patch.
 *
 * Layout: Two-column design
 *   Left column  (x≈50):  MIDI input → oscillator → filter → output
 *   Right column (x≈350): Gate → envelope (vline~)
 *   Controls:             Loadbang-initialized filter params
 *
 * Features:
 *   - MIDI note input with mtof
 *   - Gate-controlled ADSR/AR/Decay via sel + vline~ (sample-accurate)
 *   - Filter parameter controls with loadbang initialization
 *   - Section labels for readability
 *   - Multi-column layout with explicit x,y positions
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec, PortInfo } from "./port-info.js";
import type { OscillatorVariant } from "./modules/oscillator.js";
import type { FilterVariant } from "./modules/filter.js";
import type { EnvelopeVariant, EnvelopeParams } from "./modules/envelope.js";
import { validateSynthParams } from "./validate-params.js";

export interface SynthParams {
  waveform?: OscillatorVariant; // default "saw"
  filter?: FilterVariant; // default "lowpass"
  frequency?: number; // default 440
  cutoff?: number; // default 1000
  amplitude?: number; // default 0.3
  envelope?: EnvelopeVariant | "none"; // default "none"
  envelopeParams?: EnvelopeParams;
}

// Layout constants
const COL_OSC = 50; // oscillator / main signal chain
const COL_ENV = 350; // envelope section
const COL_CTRL1 = 200; // filter cutoff control
const COL_CTRL2 = 350; // filter resonance control
const SPACING = 30; // vertical spacing between nodes

export function buildSynth(params: SynthParams = {}): RackableSpec {
  validateSynthParams(params as Record<string, unknown>);

  const waveform = params.waveform ?? "saw";
  const filterType = params.filter ?? "lowpass";
  const freq = params.frequency ?? 440;
  const cutoff = params.cutoff ?? 1000;
  const amplitude = params.amplitude ?? 0.3;
  const envType = params.envelope ?? "none";
  const envP = params.envelopeParams ?? {};

  const attack = envP.attack ?? 10;
  const decay = envP.decay ?? 100;
  const sustain = envP.sustain ?? 0.7;
  const release = envP.release ?? 300;

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  // --- Helpers ---
  const add = (node: PatchNodeSpec): number => {
    const idx = nodes.length;
    nodes.push(node);
    return idx;
  };
  const wire = (from: number, to: number, outlet = 0, inlet = 0) => {
    connections.push({ from, outlet, to, inlet });
  };

  // ─── Title ────────────────────────────────────────
  const titleParts: string[] = [waveform, filterType];
  if (envType !== "none") titleParts.push(envType.toUpperCase());
  add({
    type: "text",
    args: [`Synth:`, titleParts.join(" | ")],
    x: COL_OSC,
    y: 10,
  });

  // ─── MIDI Note Input (left column) ────────────────
  let y = 40;
  add({ type: "text", args: ["MIDI", "Note", "(0-127)"], x: COL_OSC, y });
  y += 20;
  const midiAtom = add({
    type: "floatatom",
    args: [5, 0, 127, 0, "-", "-", "-"],
    x: COL_OSC,
    y,
  });
  y += SPACING;
  const mtof = add({ name: "mtof", x: COL_OSC, y });
  wire(midiAtom, mtof);
  y += SPACING;

  // ─── Oscillator (left column) ─────────────────────
  let oscOut: number;

  switch (waveform) {
    case "sine": {
      oscOut = add({ name: "osc~", args: [freq], x: COL_OSC, y });
      wire(mtof, oscOut);
      y += SPACING;
      break;
    }
    case "saw": {
      oscOut = add({ name: "phasor~", args: [freq], x: COL_OSC, y });
      wire(mtof, oscOut);
      y += SPACING;
      break;
    }
    case "square": {
      const phasor = add({ name: "phasor~", args: [freq], x: COL_OSC, y });
      wire(mtof, phasor);
      y += SPACING;
      const gt = add({ name: ">~", args: [0.5], x: COL_OSC, y });
      wire(phasor, gt);
      y += SPACING;
      const mul = add({ name: "*~", args: [2], x: COL_OSC, y });
      wire(gt, mul);
      y += SPACING;
      const sub = add({ name: "-~", args: [1], x: COL_OSC, y });
      wire(mul, sub);
      y += SPACING;
      oscOut = sub;
      break;
    }
    case "noise":
    default: {
      oscOut = add({ name: "noise~", x: COL_OSC, y });
      // noise doesn't use mtof
      y += SPACING;
      break;
    }
  }

  // ─── Envelope (right column) ──────────────────────
  let envOut: number | null = null;
  let envBottomY = 0;
  let gateAtom: number | undefined;

  if (envType !== "none") {
    let ey = 40;
    add({
      type: "text",
      args: ["---", "Envelope", "---"],
      x: COL_ENV,
      y: ey,
    });
    ey += 20;
    add({ type: "text", args: ["Gate", "(0/1)"], x: COL_ENV, y: ey });
    ey += 20;
    gateAtom = add({
      type: "floatatom",
      args: [3, 0, 1, 0, "-", "-", "-"],
      x: COL_ENV,
      y: ey,
    });
    ey += SPACING;
    const sel = add({ name: "sel", args: [1, 0], x: COL_ENV, y: ey });
    wire(gateAtom, sel);
    ey += SPACING;

    // Attack and release messages (side by side)
    let attackMsg: number;
    let releaseMsg: number;
    let envLabel: string;

    switch (envType) {
      case "adsr": {
        // Gate ON: ramp to 1 (attack), then decay to sustain
        attackMsg = add({
          type: "msg",
          args: [1, attack, "\\,", sustain, decay, attack],
          x: COL_ENV - 20,
          y: ey,
        });
        // Gate OFF: release to 0
        releaseMsg = add({
          type: "msg",
          args: [0, release],
          x: COL_ENV + 120,
          y: ey,
        });
        envLabel = `A=${attack}ms D=${decay}ms S=${sustain} R=${release}ms`;
        break;
      }
      case "ar": {
        // Gate ON: attack to 1
        attackMsg = add({
          type: "msg",
          args: [1, attack],
          x: COL_ENV - 20,
          y: ey,
        });
        // Gate OFF: release to 0
        releaseMsg = add({
          type: "msg",
          args: [0, release],
          x: COL_ENV + 120,
          y: ey,
        });
        envLabel = `A=${attack}ms R=${release}ms`;
        break;
      }
      case "decay":
      default: {
        // Gate ON: jump to 1, decay to 0
        attackMsg = add({
          type: "msg",
          args: [1, "\\,", 0, decay],
          x: COL_ENV - 20,
          y: ey,
        });
        // Gate OFF: quick silence
        releaseMsg = add({
          type: "msg",
          args: [0, 10],
          x: COL_ENV + 120,
          y: ey,
        });
        envLabel = `D=${decay}ms`;
        break;
      }
    }

    // sel outlet 0 (matched 1 = gate on) → attack
    wire(sel, attackMsg, 0);
    // sel outlet 1 (matched 0 = gate off) → release
    wire(sel, releaseMsg, 1);
    ey += 25;

    // Envelope parameter label
    add({ type: "text", args: envLabel.split(" "), x: COL_ENV - 20, y: ey });
    ey += 20;

    // vline~ (sample-accurate envelope)
    const vline = add({ name: "vline~", x: COL_ENV, y: ey });
    wire(attackMsg, vline);
    wire(releaseMsg, vline);
    envOut = vline;
    envBottomY = ey;
  }

  // ─── Filter ───────────────────────────────────────
  const filterStartY = Math.max(y, envBottomY) + 20;
  let fy = filterStartY;

  add({
    type: "text",
    args: ["---", "Filter", "---"],
    x: COL_OSC,
    y: fy,
  });
  fy += SPACING;

  let filterOut: number;
  const needsResonance = filterType === "moog" || filterType === "bandpass";

  switch (filterType) {
    case "lowpass": {
      filterOut = add({ name: "lop~", args: [cutoff], x: COL_OSC, y: fy });
      wire(oscOut, filterOut);
      break;
    }
    case "highpass": {
      filterOut = add({ name: "hip~", args: [cutoff], x: COL_OSC, y: fy });
      wire(oscOut, filterOut);
      break;
    }
    case "bandpass": {
      filterOut = add({
        name: "bp~",
        args: [cutoff, 1],
        x: COL_OSC,
        y: fy,
      });
      wire(oscOut, filterOut);
      break;
    }
    case "moog": {
      filterOut = add({
        name: "bob~",
        args: [cutoff, 2.5],
        x: COL_OSC,
        y: fy,
      });
      wire(oscOut, filterOut);
      break;
    }
    case "korg":
    default: {
      const hip = add({
        name: "hip~",
        args: [Math.round(cutoff * 0.1)],
        x: COL_OSC,
        y: fy,
      });
      wire(oscOut, hip);
      fy += SPACING;
      filterOut = add({ name: "lop~", args: [cutoff], x: COL_OSC, y: fy });
      wire(hip, filterOut);
      break;
    }
  }

  // Filter controls: loadbang → msg → filter inlet
  add({
    type: "text",
    args: ["Cutoff", "Hz"],
    x: COL_CTRL1,
    y: filterStartY,
  });
  const cutoffLB = add({
    name: "loadbang",
    x: COL_CTRL1,
    y: filterStartY + 20,
  });
  const cutoffMsg = add({
    type: "msg",
    args: [cutoff],
    x: COL_CTRL1,
    y: filterStartY + 40,
  });
  wire(cutoffLB, cutoffMsg);
  wire(cutoffMsg, filterOut, 0, 1);

  if (needsResonance) {
    const resDefault = filterType === "moog" ? 2.5 : 1;
    add({
      type: "text",
      args: ["Resonance"],
      x: COL_CTRL2,
      y: filterStartY,
    });
    const resLB = add({
      name: "loadbang",
      x: COL_CTRL2,
      y: filterStartY + 20,
    });
    const resMsg = add({
      type: "msg",
      args: [resDefault],
      x: COL_CTRL2,
      y: filterStartY + 40,
    });
    wire(resLB, resMsg);
    wire(resMsg, filterOut, 0, 2);
  }

  // ─── Output ───────────────────────────────────────
  const outputY = fy + 50;
  let gain: number;
  let dac: number;

  add({
    type: "text",
    args: ["---", "Output", "---"],
    x: COL_OSC,
    y: outputY,
  });

  if (envOut !== null) {
    // With envelope: filter → VCA (*~) → gain → dac~
    const vcaNode = add({ name: "*~", x: COL_OSC, y: outputY + SPACING });
    wire(filterOut, vcaNode);
    wire(envOut, vcaNode, 0, 1);

    gain = add({
      name: "*~",
      args: [amplitude],
      x: COL_OSC,
      y: outputY + SPACING * 2,
    });
    wire(vcaNode, gain);

    dac = add({
      name: "dac~",
      x: COL_OSC,
      y: outputY + SPACING * 3,
    });
    wire(gain, dac);
    wire(gain, dac, 0, 1); // stereo
  } else {
    // No envelope: filter → gain → dac~
    gain = add({
      name: "*~",
      args: [amplitude],
      x: COL_OSC,
      y: outputY + SPACING,
    });
    wire(filterOut, gain);

    dac = add({
      name: "dac~",
      x: COL_OSC,
      y: outputY + SPACING * 2,
    });
    wire(gain, dac);
    wire(gain, dac, 0, 1); // stereo
  }

  const ports: PortInfo[] = [
    { name: "note", type: "control", direction: "input", nodeIndex: midiAtom, port: 0 },
    { name: "audio", type: "audio", direction: "output", nodeIndex: gain, port: 0, ioNodeIndex: dac },
  ];
  if (gateAtom !== undefined) {
    ports.push({ name: "gate", type: "control", direction: "input", nodeIndex: gateAtom, port: 0 });
  }

  return { spec: { nodes, connections }, ports };
}
