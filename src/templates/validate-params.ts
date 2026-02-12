/**
 * Runtime parameter validation for template builders.
 * Catches invalid params early instead of producing garbage patches.
 */

const VALID_WAVEFORMS = new Set(["sine", "saw", "square", "noise"]);
const VALID_FILTERS = new Set(["lowpass", "highpass", "bandpass", "moog", "korg"]);
const VALID_ENVELOPES = new Set(["adsr", "ar", "decay", "none"]);
const VALID_REVERB_VARIANTS = new Set(["schroeder", "simple"]);
const VALID_DRUM_VOICES = new Set(["bd", "sn", "hh", "cp"]);
const VALID_OUTPUT_RANGES = new Set(["unipolar", "bipolar"]);

export function validateSynthParams(params: Record<string, unknown>): void {
  // Coerce booleans to sensible defaults (Claude may pass true/false instead of string)
  if (typeof params.waveform === "boolean") params.waveform = params.waveform ? "sine" : undefined;
  if (typeof params.filter === "boolean") params.filter = params.filter ? "lowpass" : undefined;
  if (typeof params.envelope === "boolean") params.envelope = params.envelope ? "adsr" : "none";

  if (params.waveform !== undefined && !VALID_WAVEFORMS.has(String(params.waveform))) {
    throw new Error(`Invalid waveform "${params.waveform}". Valid: ${[...VALID_WAVEFORMS].join(", ")}`);
  }
  if (params.filter !== undefined && !VALID_FILTERS.has(String(params.filter))) {
    throw new Error(`Invalid filter "${params.filter}". Valid: ${[...VALID_FILTERS].join(", ")}`);
  }
  if (params.envelope !== undefined && !VALID_ENVELOPES.has(String(params.envelope))) {
    throw new Error(`Invalid envelope "${params.envelope}". Valid: ${[...VALID_ENVELOPES].join(", ")}`);
  }
  if (params.frequency !== undefined) {
    const f = Number(params.frequency);
    if (!Number.isFinite(f) || f <= 0) throw new Error(`frequency must be a positive number, got ${params.frequency}`);
  }
  if (params.cutoff !== undefined) {
    const c = Number(params.cutoff);
    if (!Number.isFinite(c) || c <= 0) throw new Error(`cutoff must be a positive number, got ${params.cutoff}`);
  }
  if (params.amplitude !== undefined) {
    const a = Number(params.amplitude);
    if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error(`amplitude must be 0-1, got ${params.amplitude}`);
  }
}

export function validateSequencerParams(params: Record<string, unknown>): void {
  if (params.steps !== undefined) {
    const s = Number(params.steps);
    if (!Number.isInteger(s) || s < 1 || s > 64) throw new Error(`steps must be 1-64, got ${params.steps}`);
  }
  if (params.bpm !== undefined) {
    const b = Number(params.bpm);
    if (!Number.isFinite(b) || b <= 0) throw new Error(`bpm must be a positive number, got ${params.bpm}`);
  }
  if (params.notes !== undefined) {
    // Coerce empty array to undefined → builder uses default notes
    if (Array.isArray(params.notes) && params.notes.length === 0) {
      params.notes = undefined;
      return;
    }
    if (!Array.isArray(params.notes)) {
      throw new Error(`notes must be an array of MIDI note numbers`);
    }
    for (const n of params.notes) {
      const num = Number(n);
      if (!Number.isInteger(num) || num < 0 || num > 127) {
        throw new Error(`MIDI note must be 0-127, got ${n}`);
      }
    }
  }
  if (params.midiChannel !== undefined) {
    const ch = Number(params.midiChannel);
    if (!Number.isInteger(ch) || ch < 1 || ch > 16) throw new Error(`midiChannel must be 1-16, got ${params.midiChannel}`);
  }
  if (params.velocity !== undefined) {
    const v = Number(params.velocity);
    if (!Number.isInteger(v) || v < 0 || v > 127) throw new Error(`velocity must be 0-127, got ${params.velocity}`);
  }
}

export function validateReverbParams(params: Record<string, unknown>): void {
  // Coerce booleans to sensible defaults
  if (typeof params.variant === "boolean") params.variant = params.variant ? "schroeder" : undefined;

  if (params.variant !== undefined && !VALID_REVERB_VARIANTS.has(String(params.variant))) {
    throw new Error(`Invalid reverb variant "${params.variant}". Valid: ${[...VALID_REVERB_VARIANTS].join(", ")}`);
  }
  if (params.roomSize !== undefined) {
    const r = Number(params.roomSize);
    if (!Number.isFinite(r) || r < 0 || r > 1) throw new Error(`roomSize must be 0-1, got ${params.roomSize}`);
  }
  if (params.damping !== undefined) {
    const d = Number(params.damping);
    if (!Number.isFinite(d) || d < 0 || d > 1) throw new Error(`damping must be 0-1, got ${params.damping}`);
  }
  if (params.wetDry !== undefined) {
    const w = Number(params.wetDry);
    if (!Number.isFinite(w) || w < 0 || w > 1) throw new Error(`wetDry must be 0-1, got ${params.wetDry}`);
  }
}

export function validateMixerParams(params: Record<string, unknown>): void {
  if (params.channels !== undefined) {
    const ch = Number(params.channels);
    if (!Number.isInteger(ch) || ch < 1 || ch > 16) throw new Error(`channels must be 1-16, got ${params.channels}`);
  }
}

export function validateDrumMachineParams(params: Record<string, unknown>): void {
  if (params.voices !== undefined) {
    // Coerce empty array to undefined → builder uses default voices
    if (Array.isArray(params.voices) && params.voices.length === 0) {
      params.voices = undefined;
      return;
    }
    if (!Array.isArray(params.voices)) {
      throw new Error("voices must be an array of drum voice types");
    }
    for (const v of params.voices) {
      if (!VALID_DRUM_VOICES.has(String(v))) {
        throw new Error(`Invalid drum voice "${v}". Valid: ${[...VALID_DRUM_VOICES].join(", ")}`);
      }
    }
  }
  if (params.tune !== undefined) {
    const t = Number(params.tune);
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`tune must be 0-1, got ${params.tune}`);
  }
  if (params.decay !== undefined) {
    const d = Number(params.decay);
    if (!Number.isFinite(d) || d < 0 || d > 1) throw new Error(`decay must be 0-1, got ${params.decay}`);
  }
  if (params.tone !== undefined) {
    const t = Number(params.tone);
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`tone must be 0-1, got ${params.tone}`);
  }
  if (params.amplitude !== undefined) {
    const a = Number(params.amplitude);
    if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error(`amplitude must be 0-1, got ${params.amplitude}`);
  }
}

export function validateClockParams(params: Record<string, unknown>): void {
  if (params.bpm !== undefined) {
    const b = Number(params.bpm);
    if (!Number.isFinite(b) || b <= 0) throw new Error(`bpm must be a positive number, got ${params.bpm}`);
  }
  if (params.divisions !== undefined) {
    // Coerce empty array to undefined → builder uses default [1, 2, 4, 8]
    if (Array.isArray(params.divisions) && params.divisions.length === 0) {
      params.divisions = undefined;
      return;
    }
    if (!Array.isArray(params.divisions)) {
      throw new Error("divisions must be an array");
    }
    for (const d of params.divisions) {
      const n = Number(d);
      if (!Number.isInteger(n) || n < 1 || n > 64) {
        throw new Error(`Each division must be an integer 1-64, got ${d}`);
      }
    }
  }
}

export function validateChaosParams(params: Record<string, unknown>): void {
  if (params.outputs !== undefined) {
    const o = Number(params.outputs);
    if (!Number.isInteger(o) || o < 1 || o > 3) throw new Error(`outputs must be 1-3, got ${params.outputs}`);
  }
  if (params.speed !== undefined) {
    const s = Number(params.speed);
    if (!Number.isFinite(s) || s < 0 || s > 1) throw new Error(`speed must be 0-1, got ${params.speed}`);
  }
  if (params.r !== undefined) {
    const r = Number(params.r);
    if (!Number.isFinite(r) || r < 3.5 || r > 4.0) throw new Error(`r must be 3.5-4.0, got ${params.r}`);
  }
}

export function validateMathsParams(params: Record<string, unknown>): void {
  // Coerce booleans for enum params
  if (typeof params.outputRange === "boolean") params.outputRange = params.outputRange ? "bipolar" : undefined;

  if (params.channels !== undefined) {
    const ch = Number(params.channels);
    if (!Number.isInteger(ch) || ch < 1 || ch > 2) throw new Error(`channels must be 1-2, got ${params.channels}`);
  }
  if (params.rise !== undefined) {
    const r = Number(params.rise);
    if (!Number.isFinite(r) || r <= 0) throw new Error(`rise must be a positive number (ms), got ${params.rise}`);
  }
  if (params.fall !== undefined) {
    const f = Number(params.fall);
    if (!Number.isFinite(f) || f <= 0) throw new Error(`fall must be a positive number (ms), got ${params.fall}`);
  }
  if (params.cycle !== undefined && typeof params.cycle !== "boolean") {
    throw new Error(`cycle must be a boolean, got ${typeof params.cycle}`);
  }
  if (params.outputRange !== undefined && !VALID_OUTPUT_RANGES.has(String(params.outputRange))) {
    throw new Error(`Invalid outputRange "${params.outputRange}". Valid: ${[...VALID_OUTPUT_RANGES].join(", ")}`);
  }
}

export function validateTuringMachineParams(params: Record<string, unknown>): void {
  if (params.length !== undefined) {
    const l = Number(params.length);
    if (!Number.isInteger(l) || l < 2 || l > 16) throw new Error(`length must be 2-16, got ${params.length}`);
  }
  if (params.probability !== undefined) {
    const p = Number(params.probability);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`probability must be 0-1, got ${params.probability}`);
  }
  if (params.bpm !== undefined) {
    const b = Number(params.bpm);
    if (!Number.isFinite(b) || b <= 0) throw new Error(`bpm must be a positive number, got ${params.bpm}`);
  }
  if (params.range !== undefined) {
    const r = Number(params.range);
    if (!Number.isInteger(r) || r < 1 || r > 127) throw new Error(`range must be 1-127, got ${params.range}`);
  }
  if (params.offset !== undefined) {
    const o = Number(params.offset);
    if (!Number.isInteger(o) || o < 0 || o > 127) throw new Error(`offset must be 0-127, got ${params.offset}`);
  }
}

export function validateGranularParams(params: Record<string, unknown>): void {
  if (params.grains !== undefined) {
    const g = Number(params.grains);
    if (!Number.isInteger(g) || g < 1 || g > 4) throw new Error(`grains must be 1-4, got ${params.grains}`);
  }
  if (params.grainSize !== undefined) {
    const s = Number(params.grainSize);
    if (!Number.isFinite(s) || s < 10 || s > 500) throw new Error(`grainSize must be 10-500, got ${params.grainSize}`);
  }
  if (params.pitch !== undefined) {
    const p = Number(params.pitch);
    if (!Number.isFinite(p) || p < 0.25 || p > 4.0) throw new Error(`pitch must be 0.25-4.0, got ${params.pitch}`);
  }
  if (params.position !== undefined) {
    const p = Number(params.position);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`position must be 0-1, got ${params.position}`);
  }
  if (params.freeze !== undefined && typeof params.freeze !== "boolean") {
    throw new Error(`freeze must be a boolean, got ${typeof params.freeze}`);
  }
  if (params.wetDry !== undefined) {
    const w = Number(params.wetDry);
    if (!Number.isFinite(w) || w < 0 || w > 1) throw new Error(`wetDry must be 0-1, got ${params.wetDry}`);
  }
}
