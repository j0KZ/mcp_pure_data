/**
 * Zod schemas for create_rack tool parameters.
 */

import { z } from "zod";

export const createRackSchema = {
  modules: z
    .array(
      z.object({
        template: z
          .string()
          .describe(
            "Template name (synth, sequencer, reverb, mixer, drum-machine, clock, chaos, maths, turing-machine, granular).",
          ),
        params: z
          .record(z.unknown())
          .optional()
          .describe("Template-specific parameters (same as create_from_template params)."),
        filename: z
          .string()
          .optional()
          .describe(
            'Output filename (e.g. "kick.pd"). Auto-generated from template name if omitted.',
          ),
        id: z
          .string()
          .optional()
          .describe(
            "Module ID for wiring references. Defaults to filename without .pd extension.",
          ),
      }),
    )
    .min(1)
    .describe("Array of module specifications. Each becomes a separate .pd file."),
  wiring: z
    .array(
      z.object({
        from: z.string().describe('Source module ID (filename without .pd, or explicit id).'),
        output: z.string().describe('Output port name (e.g. "audio", "note", "beat_div1", "cv1").'),
        to: z.string().describe('Destination module ID.'),
        input: z.string().describe('Input port name (e.g. "audio_in", "note", "clock_in", "ch1").'),
      }),
    )
    .optional()
    .describe("Inter-module connections for the combined _rack.pd patch."),
  outputDir: z
    .string()
    .optional()
    .describe(
      "Optional ABSOLUTE directory path to write all .pd files. " +
        "If omitted, content is returned but not written to disk.",
    ),
};
