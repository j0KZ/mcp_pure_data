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

/**
 * A template's PatchSpec enriched with port metadata for rack wiring.
 */
export interface RackableSpec {
  spec: PatchSpec;
  ports: PortInfo[];
}
