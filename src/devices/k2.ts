/**
 * Allen & Heath Xone:K2 device profile.
 *
 * Physical layout per column (4 columns):
 *   Encoder (top) → 3 pots → 4 buttons (A-D) → Fader (bottom)
 *
 * Controls:
 *   - 4 faders (absolute CC 16-19)
 *   - 12 pots in 3 rows (absolute CC 4-15)
 *   - 6 encoders (relative 7Fh/01h, CC 0-3 top + CC 20-21 bottom)
 *   - 12 buttons in 3 rows (momentary Note On/Off, Notes 40-51)
 *
 * Encoding: 7Fh/01h two's complement — CW sends 1, CCW sends 127.
 * No hardware acceleration; one message per detent click.
 *
 * Buttons are ALWAYS momentary (Note On vel=127 on press, Note Off vel=0 on release).
 * Toggle behavior must be implemented in software.
 *
 * Default MIDI channel: 16 (1-indexed). Configurable in K2 setup mode.
 *
 * References:
 *   - Mixxx MIDI XML: github.com/mixxxdj/mixxx/blob/main/res/controllers/Allen%20and%20Heath%20Xone%20K2.midi.xml
 *   - Mixxx K2 Scripts: github.com/mixxxdj/mixxx/blob/main/res/controllers/Allen-and-Heath-Xone-K2-scripts.js
 */

import type { DeviceProfile, DeviceControl } from "./types.js";

const faders: DeviceControl[] = [
  { name: "fader1", type: "fader", cc: 16, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader2", type: "fader", cc: 17, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader3", type: "fader", cc: 18, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader4", type: "fader", cc: 19, inputType: "absolute", range: [0, 127], category: "amplitude" },
];

const pots: DeviceControl[] = [
  // Row 1 — frequency/filter controls
  { name: "pot1",  type: "pot", cc: 4,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot2",  type: "pot", cc: 5,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot3",  type: "pot", cc: 6,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot4",  type: "pot", cc: 7,  inputType: "absolute", range: [0, 127], category: "frequency" },
  // Row 2 — general
  { name: "pot5",  type: "pot", cc: 8,  inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot6",  type: "pot", cc: 9,  inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot7",  type: "pot", cc: 10, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot8",  type: "pot", cc: 11, inputType: "absolute", range: [0, 127], category: "general" },
  // Row 3 — general
  { name: "pot9",  type: "pot", cc: 12, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot10", type: "pot", cc: 13, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot11", type: "pot", cc: 14, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot12", type: "pot", cc: 15, inputType: "absolute", range: [0, 127], category: "general" },
];

// 6 encoders — relative 7Fh/01h (two's complement)
// CW sends value 1, CCW sends value 127. No other values sent.
const encoders: DeviceControl[] = [
  // 4 top encoders (one per column)
  { name: "encoder1", type: "encoder", cc: 0, inputType: "relative", range: [0, 127], category: "general" },
  { name: "encoder2", type: "encoder", cc: 1, inputType: "relative", range: [0, 127], category: "general" },
  { name: "encoder3", type: "encoder", cc: 2, inputType: "relative", range: [0, 127], category: "general" },
  { name: "encoder4", type: "encoder", cc: 3, inputType: "relative", range: [0, 127], category: "general" },
  // 2 bottom encoders
  { name: "encoder_left",  type: "encoder", cc: 20, inputType: "relative", range: [0, 127], category: "general" },
  { name: "encoder_right", type: "encoder", cc: 21, inputType: "relative", range: [0, 127], category: "general" },
];

// 12 buttons — top 3 rows (A, B, C), 4 per row
// All momentary: Note On vel=127 on press, Note Off vel=0 on release
const buttons: DeviceControl[] = [
  // Row C (bottom of the 3 main rows)
  { name: "buttonC1", type: "button", note: 40, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonC2", type: "button", note: 41, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonC3", type: "button", note: 42, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonC4", type: "button", note: 43, inputType: "trigger", range: [0, 1], category: "transport" },
  // Row B (middle)
  { name: "buttonB1", type: "button", note: 44, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonB2", type: "button", note: 45, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonB3", type: "button", note: 46, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonB4", type: "button", note: 47, inputType: "trigger", range: [0, 1], category: "transport" },
  // Row A (top)
  { name: "buttonA1", type: "button", note: 48, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonA2", type: "button", note: 49, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonA3", type: "button", note: 50, inputType: "trigger", range: [0, 1], category: "transport" },
  { name: "buttonA4", type: "button", note: 51, inputType: "trigger", range: [0, 1], category: "transport" },
];

export const k2Profile: DeviceProfile = {
  name: "xone-k2",
  label: "Allen & Heath Xone:K2",
  midiChannel: 16,
  controls: [...faders, ...pots, ...encoders, ...buttons],
  setupNotes: [
    "Set K2 MIDI channel to 16 (hold LAYER button on power-on to access setup mode).",
    "Latching layers must be OFF (default). When layers are active, CC/note numbers change unpredictably.",
    "Encoders are always relative (7Fh/01h). They send value 1 for CW and 127 for CCW — never absolute values.",
    "All buttons are momentary (Note On/Off). Toggle behavior is handled in the generated Pd patch.",
    "If USB is interrupted while K2 stays powered, power-cycle the K2 to restore MIDI communication.",
  ],
};
