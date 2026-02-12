/**
 * Roland TR-8S Rhythm Performer device profile.
 *
 * The TR-8S is a drum machine — primarily OUTPUT direction
 * (Pd → hardware via ctlout for parameter control, noteout for triggers).
 * Can also be used as INPUT (TxEditData=ON sends knob CCs to Pd).
 *
 * ALL CC messages go on a single channel (Pattern CH, default 10).
 * Instruments are differentiated by CC number, NOT by MIDI channel.
 *
 * CC#70 (Auto Fill Trigger) and CC#14 (Auto Fill IN ON) are EXCLUDED —
 * confirmed broken for reception (TX-only, footnote *2 in Roland MIDI chart).
 *
 * Research: .claude/plans/tr8s-midi-research.md
 * Sources: midi.guide, Roland MIDI Implementation Chart, Elektronauts, Roland Clan Forums
 */

import type { DeviceProfile, DeviceControl, NoteTrigger } from "./types.js";

// ─── Per-instrument controls ─────────────────────────────────────────────

function instrumentControls(
  group: string,
  tuneCC: number,
  decayCC: number,
  levelCC: number,
  ctrlCC: number,
): DeviceControl[] {
  const g = group.toLowerCase();
  return [
    { name: `${g}_tune`,  type: "pot", cc: tuneCC,  inputType: "absolute", range: [0, 127], category: "frequency",  direction: "bidirectional", group },
    { name: `${g}_decay`, type: "pot", cc: decayCC, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional", group },
    { name: `${g}_level`, type: "pot", cc: levelCC, inputType: "absolute", range: [0, 127], category: "amplitude",  direction: "bidirectional", group },
    { name: `${g}_ctrl`,  type: "pot", cc: ctrlCC,  inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional", group },
  ];
}

const perInstrument: DeviceControl[] = [
  ...instrumentControls("BD", 20, 23, 24, 96),   // Bass Drum
  ...instrumentControls("SD", 25, 28, 29, 97),   // Snare Drum
  ...instrumentControls("LT", 46, 47, 48, 102),  // Low Tom
  ...instrumentControls("MT", 49, 50, 51, 103),  // Mid Tom
  ...instrumentControls("HT", 52, 53, 54, 104),  // Hi Tom
  ...instrumentControls("RS", 55, 56, 57, 105),  // Rim Shot
  ...instrumentControls("HC", 58, 59, 60, 106),  // Hand Clap
  ...instrumentControls("CH", 61, 62, 63, 107),  // Closed Hi-Hat
  ...instrumentControls("OH", 80, 81, 82, 108),  // Open Hi-Hat
  ...instrumentControls("CC", 83, 84, 85, 109),  // Crash Cymbal
  ...instrumentControls("RC", 86, 87, 88, 110),  // Ride Cymbal
];

// ─── Global controls ─────────────────────────────────────────────────────

const globalControls: DeviceControl[] = [
  { name: "shuffle",        type: "pot", cc: 9,  inputType: "absolute", range: [0, 127], category: "transport",  direction: "bidirectional" },
  { name: "delay_level",    type: "pot", cc: 16, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
  { name: "delay_time",     type: "pot", cc: 17, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
  { name: "delay_feedback", type: "pot", cc: 18, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
  { name: "master_fx_ctrl", type: "pot", cc: 19, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
  { name: "accent",         type: "pot", cc: 71, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
  { name: "reverb_level",   type: "pot", cc: 91, inputType: "absolute", range: [0, 127], category: "general",    direction: "bidirectional" },
];

// ─── Note triggers (GM drum map defaults) ────────────────────────────────

const noteTriggers: NoteTrigger[] = [
  { name: "BD", note: 36, altNote: 35, group: "BD" },
  { name: "SD", note: 38, altNote: 40, group: "SD" },
  { name: "LT", note: 43, altNote: 41, group: "LT" },
  { name: "MT", note: 47, altNote: 45, group: "MT" },
  { name: "HT", note: 50, altNote: 48, group: "HT" },
  { name: "RS", note: 37, altNote: 56, group: "RS" },
  { name: "HC", note: 39, altNote: 54, group: "HC" },
  { name: "CH", note: 42, altNote: 44, group: "CH" },
  { name: "OH", note: 46, altNote: 58, group: "OH" },
  { name: "CC", note: 49, altNote: 61, group: "CC" },
  { name: "RC", note: 51, altNote: 63, group: "RC" },
];

export const tr8sProfile: DeviceProfile = {
  name: "tr-8s",
  label: "Roland TR-8S",
  midiChannel: 10,
  controls: [...perInstrument, ...globalControls],
  noteTriggers,
  setupNotes: [
    "CRITICAL: Set UTILITY > MIDI > RxEditData = ON (default is OFF, CC silently ignored)",
    "Set Pattern CH and Kit CH to DIFFERENT channels (both default to 10 — causes conflicts)",
    "Recommended: Pattern CH = 10 (notes + CC), Kit CH = 11 (kit selection)",
    "Set TxEditData = ON if using TR-8S knobs to control Pd parameters",
    "Set TxNote = OFF to prevent internal sequencer from sending notes to Pd",
    "CTRL knob meaning changes depending on loaded sound — labeled generically",
    "No MIDI pattern change support — patterns must be changed on the hardware",
    "CC#70 (Auto Fill Trigger) and CC#14 (Auto Fill) are broken for MIDI reception",
  ],
};
