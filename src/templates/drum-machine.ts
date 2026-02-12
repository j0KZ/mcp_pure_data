/**
 * Drum machine template — 4 analog-style drum voices.
 *
 * Voices:
 *   BD (Bass Drum): sine osc with pitch + amp envelopes
 *   SN (Snare): noise → BP filter + sine tone, mixed
 *   HH (Hi-Hat): noise → highpass filter, short decay
 *   CP (Clap): noise → BP filter, medium decay
 *
 * Layout: N columns (one per voice), triggers via msg "bang"
 * All voices summed → master gain → dac~
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateDrumMachineParams } from "./validate-params.js";

export type DrumVoice = "bd" | "sn" | "hh" | "cp";

export interface DrumMachineParams {
  voices?: DrumVoice[]; // default ["bd", "sn", "hh", "cp"]
  tune?: number; // 0-1 (default 0.5) — pitch
  decay?: number; // 0-1 (default 0.5) — envelope decay
  tone?: number; // 0-1 (default 0.5) — filter brightness
  amplitude?: number; // 0-1 (default 0.7) — master volume
}

const COL_SPACING = 180;
const SPACING = 30;

export function buildDrumMachine(params: DrumMachineParams = {}): RackableSpec {
  validateDrumMachineParams(params as Record<string, unknown>);

  const voices: DrumVoice[] = (params.voices as DrumVoice[] | undefined) ?? [
    "bd",
    "sn",
    "hh",
    "cp",
  ];
  const tune = params.tune ?? 0.5;
  const decay = params.decay ?? 0.5;
  const tone = params.tone ?? 0.5;
  const amplitude = params.amplitude ?? 0.7;

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  const add = (node: PatchNodeSpec): number => {
    const idx = nodes.length;
    nodes.push(node);
    return idx;
  };
  const wire = (from: number, to: number, outlet = 0, inlet = 0) => {
    connections.push({ from, outlet, to, inlet });
  };

  // ─── Title ──────────────────────────────────────
  add({
    type: "text",
    args: ["Drum", "Machine:", voices.join(" ").toUpperCase()],
    x: 50,
    y: 10,
  });

  const voiceOutputs: number[] = [];
  const triggerIndices = new Map<DrumVoice, number>();
  let maxVoiceY = 0;

  voices.forEach((voice, col) => {
    const x = 50 + col * COL_SPACING;
    let y = 40;

    // Voice label
    add({ type: "text", args: ["---", voice.toUpperCase(), "---"], x, y });
    y += 20;

    // Trigger (clickable msg box)
    const trigger = add({ type: "msg", args: ["bang"], x, y });
    triggerIndices.set(voice, trigger);
    y += SPACING;

    let voiceOut: number;

    switch (voice) {
      case "bd": {
        // BD: pitch envelope → osc~ × amp envelope
        const basePitch = 30 + tune * 120; // 30-150Hz
        const startPitch = basePitch * 4; // 4x overtone start
        const pitchDecayMs = 60 + tune * 40; // 60-100ms pitch sweep
        const ampDecayMs = 50 + decay * 300; // 50-350ms

        // Pitch envelope
        const pitchMsg = add({
          type: "msg",
          args: [startPitch, "\\,", basePitch, pitchDecayMs],
          x: x - 30,
          y,
        });
        wire(trigger, pitchMsg);

        // Amp envelope
        const ampMsg = add({
          type: "msg",
          args: [1, "\\,", 0, ampDecayMs],
          x: x + 80,
          y,
        });
        wire(trigger, ampMsg);
        y += SPACING;

        const pitchVline = add({ name: "vline~", x: x - 30, y });
        wire(pitchMsg, pitchVline);

        const ampVline = add({ name: "vline~", x: x + 80, y });
        wire(ampMsg, ampVline);
        y += SPACING;

        const osc = add({ name: "osc~", args: [basePitch], x, y });
        wire(pitchVline, osc);
        y += SPACING;

        const vca = add({ name: "*~", x, y });
        wire(osc, vca);
        wire(ampVline, vca, 0, 1);
        voiceOut = vca;
        break;
      }

      case "sn": {
        // SN: noise → bp~ + sine tone, mixed through amp envelope
        const bpFreq = 2000 + tone * 2000; // 2000-4000Hz
        const ampDecayMs = 50 + decay * 150; // 50-200ms

        const ampMsg = add({
          type: "msg",
          args: [1, "\\,", 0, ampDecayMs],
          x: x + 80,
          y,
        });
        wire(trigger, ampMsg);
        y += SPACING;

        const ampVline = add({ name: "vline~", x: x + 80, y });
        wire(ampMsg, ampVline);
        y += SPACING;

        // Noise path
        const noise = add({ name: "noise~", x: x - 30, y });
        y += SPACING;

        const bp = add({
          name: "bp~",
          args: [bpFreq, 10],
          x: x - 30,
          y,
        });
        wire(noise, bp);

        // Tone path
        const toneFreq = 150 + tune * 100; // 150-250Hz
        const toneOsc = add({
          name: "osc~",
          args: [toneFreq],
          x: x + 80,
          y,
        });
        y += SPACING;

        // Mix noise + tone
        const mix = add({ name: "+~", x, y });
        wire(bp, mix);
        wire(toneOsc, mix, 0, 1);
        y += SPACING;

        // VCA
        const vca = add({ name: "*~", x, y });
        wire(mix, vca);
        wire(ampVline, vca, 0, 1);
        voiceOut = vca;
        break;
      }

      case "hh": {
        // HH: noise → hip~ → amp envelope
        // decay < 0.3 = closed (30-50ms), > 0.3 = open (50-200ms)
        const ampDecayMs = 20 + decay * 180; // 20-200ms
        const hipFreq = 6000 + tone * 4000; // 6000-10000Hz

        const ampMsg = add({
          type: "msg",
          args: [0.7, "\\,", 0, ampDecayMs],
          x: x + 60,
          y,
        });
        wire(trigger, ampMsg);
        y += SPACING;

        const ampVline = add({ name: "vline~", x: x + 60, y });
        wire(ampMsg, ampVline);
        y += SPACING;

        const noise = add({ name: "noise~", x, y });
        y += SPACING;

        const hip = add({ name: "hip~", args: [hipFreq], x, y });
        wire(noise, hip);
        y += SPACING;

        const vca = add({ name: "*~", x, y });
        wire(hip, vca);
        wire(ampVline, vca, 0, 1);
        voiceOut = vca;
        break;
      }

      case "cp": {
        // CP: noise → bp~ at ~1500Hz → amp envelope
        const bpFreq = 1000 + tone * 1000; // 1000-2000Hz
        const ampDecayMs = 50 + decay * 100; // 50-150ms

        const ampMsg = add({
          type: "msg",
          args: [0.8, "\\,", 0, ampDecayMs],
          x: x + 60,
          y,
        });
        wire(trigger, ampMsg);
        y += SPACING;

        const ampVline = add({ name: "vline~", x: x + 60, y });
        wire(ampMsg, ampVline);
        y += SPACING;

        const noise = add({ name: "noise~", x, y });
        y += SPACING;

        const bp = add({
          name: "bp~",
          args: [bpFreq, 5],
          x,
          y,
        });
        wire(noise, bp);
        y += SPACING;

        const vca = add({ name: "*~", x, y });
        wire(bp, vca);
        wire(ampVline, vca, 0, 1);
        voiceOut = vca;
        break;
      }

      default:
        throw new Error(`Unknown drum voice: ${voice}`);
    }

    voiceOutputs.push(voiceOut);
    if (y > maxVoiceY) maxVoiceY = y;
  });

  // ─── Summing + Output ───────────────────────────
  const outY = maxVoiceY + 40;
  add({ type: "text", args: ["---", "Output", "---"], x: 50, y: outY });

  let sumOut: number;

  if (voiceOutputs.length === 1) {
    sumOut = voiceOutputs[0];
  } else {
    sumOut = add({ name: "+~", x: 50, y: outY + SPACING });
    wire(voiceOutputs[0], sumOut);
    wire(voiceOutputs[1], sumOut, 0, 1);

    for (let i = 2; i < voiceOutputs.length; i++) {
      const nextSum = add({
        name: "+~",
        x: 50,
        y: outY + SPACING + (i - 1) * SPACING,
      });
      wire(sumOut, nextSum);
      wire(voiceOutputs[i], nextSum, 0, 1);
      sumOut = nextSum;
    }
  }

  const gainY =
    outY + SPACING + Math.max(0, voiceOutputs.length - 2) * SPACING + SPACING;

  const gain = add({ name: "*~", args: [amplitude], x: 50, y: gainY });
  wire(sumOut, gain);

  const dac = add({ name: "dac~", x: 50, y: gainY + SPACING });
  wire(gain, dac);
  wire(gain, dac, 0, 1);

  const ports = [];
  for (const voice of voices) {
    const trigIdx = triggerIndices.get(voice);
    if (trigIdx !== undefined) {
      ports.push({ name: `trig_${voice}`, type: "control" as const, direction: "input" as const, nodeIndex: trigIdx, port: 0 });
    }
  }
  ports.push({ name: "audio", type: "audio" as const, direction: "output" as const, nodeIndex: gain, port: 0, ioNodeIndex: dac });

  return { spec: { nodes, connections }, ports };
}
