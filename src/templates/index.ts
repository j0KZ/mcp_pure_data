/**
 * Template registry — dispatches template name to builder function.
 */

import type { PatchSpec } from "../core/serializer.js";
import type { RackableSpec } from "./port-info.js";
import { buildSynth, type SynthParams } from "./synth.js";
import { buildSequencer, type SequencerParams } from "./sequencer.js";
import { buildReverb, type ReverbTemplateParams } from "./reverb-template.js";
import { buildMixer, type MixerParams } from "./mixer.js";
import { buildDrumMachine, type DrumMachineParams } from "./drum-machine.js";
import { buildClock, type ClockParams } from "./clock.js";
import { buildChaos, type ChaosParams } from "./chaos.js";
import { buildMaths, type MathsParams } from "./maths.js";
import { buildTuringMachine, type TuringMachineParams } from "./turing-machine.js";
import { buildGranular, type GranularParams } from "./granular.js";

export type { RackableSpec } from "./port-info.js";
export type { PortInfo, SignalType, PortDirection } from "./port-info.js";

export type TemplateName =
  | "synth"
  | "sequencer"
  | "reverb"
  | "mixer"
  | "drum-machine"
  | "clock"
  | "chaos"
  | "maths"
  | "turing-machine"
  | "granular";

export const TEMPLATE_NAMES: TemplateName[] = [
  "synth",
  "sequencer",
  "reverb",
  "mixer",
  "drum-machine",
  "clock",
  "chaos",
  "maths",
  "turing-machine",
  "granular",
];

export type TemplateParams =
  | SynthParams
  | SequencerParams
  | ReverbTemplateParams
  | MixerParams
  | DrumMachineParams
  | ClockParams
  | ChaosParams
  | MathsParams
  | TuringMachineParams
  | GranularParams;

/**
 * Build a RackableSpec (PatchSpec + ports) from a named template and params.
 * Throws if template name is unknown.
 */
export function buildTemplateWithPorts(name: string, params: Record<string, unknown> = {}): RackableSpec {
  switch (name) {
    case "synth":
      return buildSynth(params as SynthParams);
    case "sequencer":
      return buildSequencer(params as SequencerParams);
    case "reverb":
      return buildReverb(params as ReverbTemplateParams);
    case "mixer":
      return buildMixer(params as MixerParams);
    case "drum-machine":
      return buildDrumMachine(params as DrumMachineParams);
    case "clock":
      return buildClock(params as ClockParams);
    case "chaos":
      return buildChaos(params as ChaosParams);
    case "maths":
      return buildMaths(params as MathsParams);
    case "turing-machine":
      return buildTuringMachine(params as TuringMachineParams);
    case "granular":
      return buildGranular(params as GranularParams);
    default:
      throw new Error(
        `Unknown template "${name}". Available templates: ${TEMPLATE_NAMES.join(", ")}`,
      );
  }
}

/**
 * Build a PatchSpec from a named template and params (backward-compatible).
 * Throws if template name is unknown.
 */
export function buildTemplate(name: string, params: Record<string, unknown> = {}): PatchSpec {
  return buildTemplateWithPorts(name, params).spec;
}
