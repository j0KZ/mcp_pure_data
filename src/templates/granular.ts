/**
 * Granular synthesis template — buffer-based granular processor.
 *
 * Structure:
 *   adc~ → spigot (record control) → tabwrite~ buffer
 *   Per grain: phasor~ → tabread4~ with envelope → output
 *   Wet/dry mix → dac~
 *
 * Maps to: CalSynth Typhoon (expanded Clouds) + Mutable Instruments Beads
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { validateGranularParams } from "./validate-params.js";

export interface GranularParams {
  grains?: number; // 1-4 (default 2)
  grainSize?: number; // 10-500ms (default 100)
  pitch?: number; // 0.25-4.0 (default 1.0)
  position?: number; // 0-1 (default 0.5)
  freeze?: boolean; // default false
  wetDry?: number; // 0-1 (default 0.5)
}

const SPACING = 30;

export function buildGranular(params: GranularParams = {}): RackableSpec {
  validateGranularParams(params as Record<string, unknown>);

  const grains = params.grains ?? 2;
  const grainSize = params.grainSize ?? 100;
  const pitch = params.pitch ?? 1.0;
  const position = params.position ?? 0.5;
  const freeze = params.freeze ?? false;
  const wetDry = params.wetDry ?? 0.5;

  const sampleRate = 44100;
  const bufferSizeMs = 2000;
  const bufferSamples = Math.round((bufferSizeMs / 1000) * sampleRate);
  const bufferName = "gran_buf";

  const grainSizeSamples = Math.round((grainSize / 1000) * sampleRate);
  const grainRateHz = +(1000 / grainSize).toFixed(2);

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

  let y = 40;
  const x = 50;

  // ─── Title ──────────────────────────────────────
  add({
    type: "text",
    args: [`Granular: ${grains} grains, ${grainSize}ms`],
    x,
    y: 10,
  });

  // ─── Buffer ─────────────────────────────────────
  add({ name: "table", args: [bufferName, bufferSamples], x, y });
  y += SPACING;

  // ─── Input Section ──────────────────────────────
  add({ type: "text", args: ["---", "Input", "---"], x, y });
  y += 20;

  const adc = add({ name: "adc~", x, y });
  y += SPACING;

  // Record control: floatatom labeled "Record" (1=recording, 0=frozen)
  // Value goes directly to spigot right inlet — no inversion needed
  add({ type: "text", args: ["Record", "(1=on)"], x: x + 120, y: y - 20 });
  const recordCtrl = add({
    type: "floatatom",
    args: [3, 0, 1, 0, "-", "-", "-"],
    x: x + 120,
    y,
  });

  // Set initial value via loadbang
  const recLoadbang = add({ name: "loadbang", x: x + 200, y: y - 20 });
  const recInitMsg = add({
    type: "msg",
    args: [freeze ? 0 : 1],
    x: x + 200,
    y,
  });
  wire(recLoadbang, recInitMsg);
  wire(recInitMsg, recordCtrl);

  // Spigot: passes audio when record=1, blocks when record=0
  const spigot = add({ name: "spigot", x, y });
  wire(adc, spigot);
  wire(recordCtrl, spigot, 0, 1);
  y += SPACING;

  // tabwrite~ (continuous recording)
  const tabwrite = add({
    name: "tabwrite~",
    args: [bufferName],
    x,
    y,
  });
  wire(spigot, tabwrite);
  y += SPACING + 10;

  // ─── Grain Section ──────────────────────────────
  add({ type: "text", args: ["---", "Grains", "---"], x, y });
  y += 20;

  const grainOutputs: number[] = [];
  const grainStartY = y;

  for (let g = 0; g < grains; g++) {
    const gx = x + g * 200;
    let gy = grainStartY;

    add({ type: "text", args: [`Grain ${g + 1}`], x: gx, y: gy });
    gy += 20;

    // Grain playback phasor (rate * pitch)
    // Each grain offset in phase by spreading position
    const grainPitch = +(grainRateHz * pitch).toFixed(2);
    const phasor = add({
      name: "phasor~",
      args: [grainPitch],
      x: gx,
      y: gy,
    });
    gy += SPACING;

    // Scale to grain size in samples
    const mulSize = add({
      name: "*~",
      args: [grainSizeSamples],
      x: gx,
      y: gy,
    });
    wire(phasor, mulSize);
    gy += SPACING;

    // Add position offset (spread grains across buffer)
    const posOffset = Math.round(
      position * (bufferSamples - grainSizeSamples) +
        g * (grainSizeSamples * 0.5),
    );
    const addPos = add({
      name: "+~",
      args: [posOffset],
      x: gx,
      y: gy,
    });
    wire(mulSize, addPos);
    gy += SPACING;

    // Read from buffer (interpolated)
    const tabread = add({
      name: "tabread4~",
      args: [bufferName],
      x: gx,
      y: gy,
    });
    wire(addPos, tabread);
    gy += SPACING;

    // Grain envelope: trapezoidal
    // phasor~ → *~ 4 → clip~ 0 1 (ramps up in first 25%, stays 1, never reaches ramp-down)
    // Better: phasor~ → custom shape
    // Simple approach: use a separate phasor for envelope
    const envPhasor = add({
      name: "phasor~",
      args: [grainRateHz],
      x: gx + 80,
      y: grainStartY + 20,
    });

    // Triangle-ish envelope: phasor → *2 → clip 0 1 → *-2 → +1 → clip 0 1
    // This creates: ramp up 0→1 in first half, ramp down 1→0 in second half
    const envMul2 = add({
      name: "*~",
      args: [2],
      x: gx + 80,
      y: grainStartY + 50,
    });
    wire(envPhasor, envMul2);

    // For rising half: min(phasor*2, 1)
    const envClip1 = add({
      name: "clip~",
      args: [0, 1],
      x: gx + 80,
      y: grainStartY + 80,
    });
    wire(envMul2, envClip1);

    // For falling half: (1 - phasor) * 2, clipped
    // Combined: clip(2*phasor, 0, 1) * clip(2*(1-phasor), 0, 1)
    // Simpler: use min(phasor*4, (1-phasor)*4, 1) → trapezoidal
    // Simplest: just clip the rising ramp and use it as-is for a sawtooth envelope
    // Actually, let's do a proper Hann-ish window:
    // phasor → *-1 → +0.5 → abs~ is not available simply
    // Let's keep it simple: clip(phasor*4, 0, 1) gives ramp-up in first 25%, then sustain
    const envFinal = add({
      name: "*~",
      args: [4],
      x: gx + 80,
      y: grainStartY + 110,
    });
    wire(envPhasor, envFinal);

    const envClip = add({
      name: "clip~",
      args: [0, 1],
      x: gx + 80,
      y: grainStartY + 140,
    });
    wire(envFinal, envClip);

    // Apply envelope to grain audio
    const grainVCA = add({ name: "*~", x: gx, y: gy });
    wire(tabread, grainVCA);
    wire(envClip, grainVCA, 0, 1);

    grainOutputs.push(grainVCA);
  }

  // ─── Sum Grains ─────────────────────────────────
  const sumY = grainStartY + 200;
  let grainSum: number;

  if (grainOutputs.length === 1) {
    grainSum = grainOutputs[0];
  } else {
    grainSum = add({ name: "+~", x, y: sumY });
    wire(grainOutputs[0], grainSum);
    wire(grainOutputs[1], grainSum, 0, 1);

    for (let i = 2; i < grainOutputs.length; i++) {
      const nextSum = add({
        name: "+~",
        x,
        y: sumY + (i - 1) * SPACING,
      });
      wire(grainSum, nextSum);
      wire(grainOutputs[i], nextSum, 0, 1);
      grainSum = nextSum;
    }
  }

  // ─── Wet/Dry Mix ────────────────────────────────
  const mixY = sumY + Math.max(0, grainOutputs.length - 2) * SPACING + 50;

  add({ type: "text", args: ["---", "Mix", "---"], x, y: mixY });

  // Dry path
  const dryGain = add({
    name: "*~",
    args: [+(1 - wetDry).toFixed(2)],
    x: x + 150,
    y: mixY + 20,
  });
  wire(adc, dryGain);

  // Wet path
  const wetGain = add({
    name: "*~",
    args: [+wetDry.toFixed(2)],
    x,
    y: mixY + 20,
  });
  wire(grainSum, wetGain);

  // Sum
  const finalSum = add({ name: "+~", x, y: mixY + 50 });
  wire(dryGain, finalSum, 0, 1);
  wire(wetGain, finalSum);

  // DAC
  const dac = add({ name: "dac~", x, y: mixY + 80 });
  wire(finalSum, dac);
  wire(finalSum, dac, 0, 1);

  return {
    spec: { nodes, connections },
    ports: [
      { name: "audio_in", type: "audio", direction: "input", nodeIndex: spigot, port: 0, ioNodeIndex: adc },
      { name: "audio", type: "audio", direction: "output", nodeIndex: finalSum, port: 0, ioNodeIndex: dac },
    ],
  };
}
