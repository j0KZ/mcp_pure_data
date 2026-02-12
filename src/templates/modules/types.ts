/**
 * Module system types for composable patch building blocks.
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../../core/serializer.js";

export type { PatchNodeSpec, PatchConnectionSpec };

/**
 * A relocatable patch fragment returned by every module function.
 * All node indices in `connections`, `inlets`, and `outlets` are relative to 0.
 */
export interface ModuleResult {
  /** Nodes in this module (0-indexed). */
  nodes: PatchNodeSpec[];
  /** Internal connections (indices relative to this module's nodes). */
  connections: PatchConnectionSpec[];
  /** Node indices that accept external input (relative to 0). */
  inlets: number[];
  /** Node indices that produce external output (relative to 0). */
  outlets: number[];
}

/**
 * Wiring spec for connecting modules in compose().
 *
 * `from.outlet` / `to.inlet` index into the module's outlets[]/inlets[] arrays.
 * `fromPort` / `toPort` are the actual Pd port numbers (default 0).
 */
export interface ModuleWire {
  from: { module: number; outlet: number };
  to: { module: number; inlet: number };
  /** Pd outlet port number on the source node (default 0). */
  fromPort?: number;
  /** Pd inlet port number on the destination node (default 0). */
  toPort?: number;
}
