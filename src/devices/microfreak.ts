/**
 * Arturia MicroFreak device profile.
 *
 * The MicroFreak is a synthesizer — controls are OUTPUT direction
 * (Pd → hardware via ctlout), not input like a knob controller.
 *
 * Minimum firmware: V5.0+ (21 oscillator types, 512 presets).
 * Default MIDI channel: 1 (channel 1 behaves as omni — confirmed bug).
 *
 * Research: .claude/plans/microfreak-midi-research.md
 * Sources: midi.guide, Arturia Forum, Arturia Legacy Forum
 */

import type { DeviceProfile, DeviceControl } from "./types.js";

/**
 * CC 9 Oscillator Type reception-range midpoints.
 *
 * CONFIRMED BUG: The MicroFreak transmits values that fall OUTSIDE
 * the ranges it accepts for reception. 10 of 22 types are affected.
 * Always use these midpoint values when sending from Pd.
 *
 * Source: https://forum.arturia.com/t/transmitted-vs-received-midi-cc-values-for-digital-oscillator-type-parameter-dont-match/6268
 */
export const oscTypeValues: Record<string, number> = {
  BasicWaves: 2,
  SuperWave: 14,
  Wavetable: 19,
  Harmo: 25,
  KarplusStr: 31,
  VAnalog: 37,
  Waveshaper: 43,
  TwoOpFM: 50,
  Formant: 57,
  Chords: 63,
  Speech: 69,
  Modal: 75,
  Bass: 80,
  SawX: 85,
  HarmNE: 91,
  WaveUser: 96,
  Sample: 102,
  ScanGrains: 107,
  CloudGrains: 113,
  HitGrains: 118,
  Vocoder: 124,
};

const controls: DeviceControl[] = [
  // Oscillator
  { name: "osc_type",    type: "pot", cc: 9,  inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },
  { name: "osc_wave",    type: "pot", cc: 10, inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },
  { name: "osc_timbre",  type: "pot", cc: 12, inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },
  { name: "osc_shape",   type: "pot", cc: 13, inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },

  // Filter
  { name: "filter_cutoff",    type: "pot", cc: 23, inputType: "absolute", range: [0, 127], category: "frequency", direction: "output" },
  { name: "filter_resonance", type: "pot", cc: 83, inputType: "absolute", range: [0, 127], category: "frequency", direction: "output" },
  // CC 26 is bipolar: center=64, 0-63 negative, 65-127 positive
  { name: "env_filter_amount", type: "pot", cc: 26, inputType: "absolute", range: [0, 127], category: "frequency", direction: "output", bipolar: true },

  // Envelope
  { name: "env_attack",  type: "pot", cc: 105, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "env_decay",   type: "pot", cc: 106, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "env_sustain",  type: "pot", cc: 29, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },

  // Cycling Envelope
  { name: "cyc_rise",    type: "pot", cc: 102, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "cyc_fall",    type: "pot", cc: 103, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "cyc_amount",  type: "pot", cc: 24,  inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "cyc_hold",    type: "pot", cc: 28,  inputType: "absolute", range: [0, 127], category: "general", direction: "output" },

  // Modulation
  { name: "lfo_rate_free", type: "pot", cc: 93, inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },
  { name: "lfo_rate_sync", type: "pot", cc: 94, inputType: "absolute", range: [0, 127], category: "general",   direction: "output" },

  // Transport / ARP-SEQ
  { name: "arp_rate_free", type: "pot", cc: 91, inputType: "absolute", range: [0, 127], category: "transport", direction: "output" },
  { name: "arp_rate_sync", type: "pot", cc: 92, inputType: "absolute", range: [0, 127], category: "transport", direction: "output" },

  // General
  { name: "glide",          type: "pot", cc: 5,  inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "keyboard_spice", type: "pot", cc: 2,  inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
  { name: "keyboard_hold",  type: "button", cc: 64, inputType: "absolute", range: [0, 127], category: "general", direction: "output" },
];

export const microfreakProfile: DeviceProfile = {
  name: "microfreak",
  label: "Arturia MicroFreak",
  midiChannel: 1,
  controls,
  setupNotes: [
    "Firmware V5.0+ required (21 oscillator types)",
    "MIDI channel 1 only (channels 2-16 reject input due to confirmed bug)",
    "Do NOT route MicroFreak MIDI Out back to clock source (echoes clock → feedback loop)",
    "USB MIDI is less stable than DIN — prefer TRS-B MIDI adapter for reliability",
    "CC 91 is ARP/SEQ Rate, NOT volume — no master volume CC exists",
  ],
};
