/**
 * Port metadata types for inter-module wiring in rack patches.
 *
 * Each template exposes named ports (inputs/outputs) that the wiring
 * system uses to connect modules via throw~/catch~ (audio) or
 * send/receive (control) buses.
 */

import type { PatchSpec } from "../core/serializer.js";

export type SignalType = "audio" | "control";
export type PortDirection = "input" | "output";

/**
 * Describes a single named I/O port on a template.
 */
export interface PortInfo {
  /** Port name: "audio", "note", "beat_div1", "clock_in", "ch1", etc. */
  name: string;
  /** Signal type determines bus objects: audio → throw~/catch~, control → send/receive. */
  type: SignalType;
  /** Whether this port accepts or produces signals. */
  direction: PortDirection;
  /** Index into PatchSpec.nodes[] — the signal node to tap or feed. */
  nodeIndex: number;
  /** Pd outlet (for output) or inlet (for input) on that node (default 0). */
  port: number;
  /**
   * Optional terminal I/O node to disconnect when wired.
   * For outputs: dac~, outlet~, noteout (remove connections TO this node).
   * For inputs: adc~, inlet~, metro (redirect connections FROM this node).
   */
  ioNodeIndex?: number;
}

export type ParameterCategory = "filter" | "oscillator" | "amplitude" | "effect" | "transport";

/**
 * Describes a runtime-controllable parameter on a template.
 *
 * Parameters target audio object control inlets directly (not floatatoms).
 * In Pd, `lop~ 1000` accepts a float on inlet 1 to change cutoff;
 * `*~ 0.3` accepts a float on inlet 1 to change gain.
 * The existing loadbang → msg chain provides the initial value;
 * a receive bus provides runtime override.
 */
export interface ParameterDescriptor {
  /** Parameter identifier: "cutoff", "volume_ch1", "amplitude" */
  name: string;
  /** Human-readable label: "Filter Cutoff", "Channel 1 Volume" */
  label: string;
  /** Parameter minimum value */
  min: number;
  /** Parameter maximum value */
  max: number;
  /** Default value (set by loadbang chain) */
  default: number;
  /** Unit label: "Hz", "", "dB" */
  unit: string;
  /** Scaling curve for MIDI → parameter mapping */
  curve: "linear" | "exponential";
  /** Index into PatchSpec.nodes[] — the target node to control */
  nodeIndex: number;
  /** Which inlet on the target node receives the value */
  inlet: number;
  /** Auto-mapping category hint */
  category: ParameterCategory;
  /** Control behavior: continuous (default), trigger (bang on press), toggle (0/1 flip) */
  controlType?: "continuous" | "trigger" | "toggle";
}

/**
 * A template's PatchSpec enriched with port metadata for rack wiring
 * and optional parameter descriptors for controller integration.
 */
export interface RackableSpec {
  spec: PatchSpec;
  ports: PortInfo[];
  parameters?: ParameterDescriptor[];
}
