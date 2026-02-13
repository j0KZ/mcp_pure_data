/**
 * K2 Deck config generator.
 *
 * Generates a JSON config compatible with the K2 Deck Python app
 * (D:\Users\j0KZ\Documents\Coding\K2_controller_design\k2deck\config\).
 *
 * Generates osc_send actions so K2 Deck forwards MIDI values to Pd via OSC.
 * K2 Deck owns the MIDI port; Pd receives values through a bridge patch.
 */

import type { ControllerMapping } from "./types.js";

/** LED color by parameter category. */
const CATEGORY_LED_COLOR: Record<string, string> = {
  amplitude: "green",
  filter: "red",
  oscillator: "red",
  frequency: "red",
  effect: "amber",
  transport: "amber",
  general: "amber",
};

/**
 * K2 column layout: each column has a row A button that serves as LED indicator.
 * Column 1: note 36, Column 2: note 37, Column 3: note 38, Column 4: note 39.
 *
 * CC-to-column mapping:
 *   Faders: CC 16→col1, CC 17→col2, CC 18→col3, CC 19→col4
 *   Pot row 1: CC 4→col1, CC 5→col2, CC 6→col3, CC 7→col4
 *   Pot row 2: CC 8→col1, CC 9→col2, CC 10→col3, CC 11→col4
 *   Pot row 3: CC 12→col1, CC 13→col2, CC 14→col3, CC 15→col4
 */
function ccToColumn(cc: number): number | undefined {
  // Top encoders: CC 0-3 → columns 0-3
  if (cc >= 0 && cc <= 3) return cc;
  // Pots: CC 4-15 → columns 0-3 (repeating per row)
  if (cc >= 4 && cc <= 15) return (cc - 4) % 4;
  // Faders: CC 16-19 → columns 0-3
  if (cc >= 16 && cc <= 19) return cc - 16;
  // CC 20-21 (bottom encoders) — not column-aligned
  return undefined;
}

/**
 * Button note → column mapping.
 * Notes 40-51 span rows C/B/A, 4 per row.
 */
function noteToColumn(note: number): number | undefined {
  if (note >= 40 && note <= 51) return (note - 40) % 4;
  return undefined;
}

const ROW_A_NOTES = [36, 37, 38, 39]; // Button row A, columns 1-4

const DEFAULT_OSC_HOST = "127.0.0.1";
const DEFAULT_OSC_PORT = 9000;
const DEFAULT_OSC_ADDRESS = "/pd/param";

/** Options for K2 Deck config generation. */
export interface K2DeckConfigOptions {
  /** OSC target host (default: "127.0.0.1") */
  oscHost?: string;
  /** OSC target port (default: 9000) */
  oscPort?: number;
  /** OSC address pattern (default: "/pd/param") */
  oscAddress?: string;
}

/**
 * Build an osc_send entry for absolute CC controls (faders/pots).
 */
function buildAbsoluteEntry(
  mapping: ControllerMapping,
  label: string,
  opts: Required<K2DeckConfigOptions>,
): Record<string, unknown> {
  return {
    name: label,
    action: "osc_send",
    osc_host: opts.oscHost,
    osc_port: opts.oscPort,
    osc_address: opts.oscAddress,
    osc_param: mapping.busName,
    min: mapping.parameter.min,
    max: mapping.parameter.max,
    curve: mapping.parameter.curve,
  };
}

/**
 * Build an osc_send_relative entry for relative CC controls (encoders).
 */
function buildRelativeEntry(
  mapping: ControllerMapping,
  label: string,
  opts: Required<K2DeckConfigOptions>,
): Record<string, unknown> {
  const range = mapping.parameter.max - mapping.parameter.min;
  return {
    name: label,
    action: "osc_send_relative",
    osc_host: opts.oscHost,
    osc_port: opts.oscPort,
    osc_address: opts.oscAddress,
    osc_param: mapping.busName,
    min: mapping.parameter.min,
    max: mapping.parameter.max,
    step: range / 127,
    initial: mapping.parameter.default,
  };
}

/**
 * Build an osc_send_trigger entry for button controls.
 */
function buildTriggerEntry(
  mapping: ControllerMapping,
  label: string,
  opts: Required<K2DeckConfigOptions>,
): Record<string, unknown> {
  const mode = mapping.parameter.controlType === "toggle" ? "toggle" : "bang";
  const entry: Record<string, unknown> = {
    name: label,
    action: "osc_send_trigger",
    osc_host: opts.oscHost,
    osc_port: opts.oscPort,
    osc_address: opts.oscAddress,
    osc_param: mapping.busName,
    mode,
  };

  // Add LED config for toggle buttons
  if (mode === "toggle") {
    const color = CATEGORY_LED_COLOR[mapping.parameter.category] ?? "amber";
    entry.led = { color, mode: "toggle" };
  }

  return entry;
}

/**
 * Generate a K2 Deck config for the mapped controls.
 */
export function generateK2DeckConfig(
  mappings: ControllerMapping[],
  midiChannel: number,
  options?: K2DeckConfigOptions,
): Record<string, unknown> {
  const opts: Required<K2DeckConfigOptions> = {
    oscHost: options?.oscHost ?? DEFAULT_OSC_HOST,
    oscPort: options?.oscPort ?? DEFAULT_OSC_PORT,
    oscAddress: options?.oscAddress ?? DEFAULT_OSC_ADDRESS,
  };

  // Build separate mapping sections by control type
  const ccAbsolute: Record<string, Record<string, unknown>> = {};
  const ccRelative: Record<string, Record<string, unknown>> = {};
  const noteOn: Record<string, Record<string, unknown>> = {};
  // Track first mapped category per column (for LED color)
  const columnCategories = new Map<number, string>();

  for (const mapping of mappings) {
    const label = `${mapping.moduleId}: ${mapping.parameter.label}`;

    if (mapping.control.inputType === "relative" && mapping.control.cc !== undefined) {
      ccRelative[String(mapping.control.cc)] = buildRelativeEntry(mapping, label, opts);
      const col = ccToColumn(mapping.control.cc);
      if (col !== undefined && !columnCategories.has(col)) {
        columnCategories.set(col, mapping.parameter.category);
      }
    } else if (mapping.control.inputType === "trigger" && mapping.control.note !== undefined) {
      noteOn[String(mapping.control.note)] = buildTriggerEntry(mapping, label, opts);
      const col = noteToColumn(mapping.control.note);
      if (col !== undefined && !columnCategories.has(col)) {
        columnCategories.set(col, mapping.parameter.category);
      }
    } else if (mapping.control.cc !== undefined) {
      ccAbsolute[String(mapping.control.cc)] = buildAbsoluteEntry(mapping, label, opts);
      const col = ccToColumn(mapping.control.cc);
      if (col !== undefined && !columnCategories.has(col)) {
        columnCategories.set(col, mapping.parameter.category);
      }
    }
  }

  // Build LED defaults: light row A button per column
  const onStart: { note: number; color: string }[] = [];
  for (const [col, category] of columnCategories) {
    if (col >= 0 && col < ROW_A_NOTES.length) {
      onStart.push({
        note: ROW_A_NOTES[col],
        color: CATEGORY_LED_COLOR[category] ?? "amber",
      });
    }
  }

  const mappingSections: Record<string, unknown> = {
    cc_absolute: ccAbsolute,
  };
  if (Object.keys(ccRelative).length > 0) {
    mappingSections.cc_relative = ccRelative;
  }
  if (Object.keys(noteOn).length > 0) {
    mappingSections.note_on = noteOn;
  }

  return {
    profile_name: "pd_rack",
    midi_channel: midiChannel,
    midi_device: "XONE:K2",
    led_color_offsets: { red: 0, amber: 36, green: 72 },
    throttle: { cc_max_hz: 30, cc_volume_max_hz: 20 },
    mappings: mappingSections,
    led_defaults: {
      on_start: onStart,
      on_connect: "all_off",
      startup_animation: false,
    },
  };
}
