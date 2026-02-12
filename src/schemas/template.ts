/**
 * Zod schemas for create_from_template tool parameters.
 */

import { z } from "zod";

export const createFromTemplateSchema = {
  template: z
    .string()
    .describe(
      'Template name: "synth", "sequencer", "reverb", "mixer", "drum-machine", "clock", "chaos", "maths", "turing-machine", or "granular".',
    ),
  params: z
    .record(z.unknown())
    .optional()
    .describe(
      "Template-specific parameters as a JSON object. " +
        "Synth: { waveform, filter, frequency, cutoff, amplitude, envelope }. " +
        "Sequencer: { steps, bpm, notes, midiChannel, velocity }. " +
        "Reverb: { variant, roomSize, damping, wetDry }. " +
        "Mixer: { channels, stereo }. " +
        "Drum-machine: { voices, tune, decay, tone, amplitude }. " +
        "Clock: { bpm, divisions }. " +
        "Chaos: { outputs, speed, r }. " +
        "Maths: { channels, rise, fall, cycle, outputRange }. " +
        "Turing-machine: { length, probability, bpm, range, offset }. " +
        "Granular: { grains, grainSize, pitch, position, freeze, wetDry }.",
    ),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Optional ABSOLUTE file path to write the .pd file. " +
        "Only use if the user explicitly requests saving to a specific path. " +
        "The .pd content is always returned in the response regardless.",
    ),
};
