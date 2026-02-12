/**
 * K2 Deck config generator.
 *
 * Generates a JSON config compatible with the K2 Deck Python app
 * (D:\Users\j0KZ\Documents\Coding\K2_controller_design\k2deck\config\).
 *
 * Provides LED feedback and control documentation.
 * Action is "noop" because Pd handles MIDI routing via _controller.pd.
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

/**
 * Generate a K2 Deck config for the mapped controls.
 */
export function generateK2DeckConfig(
  mappings: ControllerMapping[],
  midiChannel: number,
): Record<string, unknown> {
  // Build separate mapping sections by control type
  const ccAbsolute: Record<string, { name: string; action: string }> = {};
  const ccRelative: Record<string, { name: string; action: string }> = {};
  const noteOn: Record<string, { name: string; action: string }> = {};
  // Track first mapped category per column (for LED color)
  const columnCategories = new Map<number, string>();

  for (const mapping of mappings) {
    const label = `${mapping.moduleId}: ${mapping.parameter.label}`;
    const entry = { name: label, action: "noop" };

    if (mapping.control.inputType === "relative" && mapping.control.cc !== undefined) {
      ccRelative[String(mapping.control.cc)] = entry;
      const col = ccToColumn(mapping.control.cc);
      if (col !== undefined && !columnCategories.has(col)) {
        columnCategories.set(col, mapping.parameter.category);
      }
    } else if (mapping.control.inputType === "trigger" && mapping.control.note !== undefined) {
      noteOn[String(mapping.control.note)] = entry;
      const col = noteToColumn(mapping.control.note);
      if (col !== undefined && !columnCategories.has(col)) {
        columnCategories.set(col, mapping.parameter.category);
      }
    } else if (mapping.control.cc !== undefined) {
      ccAbsolute[String(mapping.control.cc)] = entry;
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
