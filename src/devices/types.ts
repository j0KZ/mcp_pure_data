/**
 * Device profile types for MIDI controller integration.
 */

export interface DeviceControl {
  /** Control name: "fader1", "pot1", "encoder1", "buttonA1" */
  name: string;
  /** Physical control type */
  type: "fader" | "pot" | "encoder" | "button";
  /** MIDI CC number (faders, pots, encoders) */
  cc?: number;
  /** MIDI note number (buttons) */
  note?: number;
  /** Input behavior */
  inputType: "absolute" | "relative" | "trigger";
  /** Value range [min, max] */
  range: [number, number];
  /** Auto-mapping category hint */
  category: "amplitude" | "frequency" | "general" | "transport";
  /** Signal direction: input (hardware→Pd), output (Pd→hardware), bidirectional. Default: "input" */
  direction?: "input" | "output" | "bidirectional";
  /** Bipolar control with center=64 (e.g. MicroFreak CC 26 filter amount) */
  bipolar?: boolean;
  /** Control group for instrument-organized devices (e.g. "BD", "SD" on TR-8S) */
  group?: string;
}

/** Note trigger for drum machines and note-based triggering. */
export interface NoteTrigger {
  /** Trigger name: "BD", "SD", "CH" */
  name: string;
  /** Primary MIDI note number */
  note: number;
  /** Alternate note number (e.g. GM drum map alternates) */
  altNote?: number;
  /** Instrument group (same as DeviceControl.group for matching) */
  group?: string;
}

export interface DeviceProfile {
  /** Device identifier: "xone-k2" */
  name: string;
  /** Human-readable name: "Allen & Heath Xone:K2" */
  label: string;
  /** Default MIDI channel (1-indexed) */
  midiChannel: number;
  /** Available controls */
  controls: DeviceControl[];
  /** Note triggers for drum instruments */
  noteTriggers?: NoteTrigger[];
  /** Required setup steps the user must do on the hardware */
  setupNotes?: string[];
}
