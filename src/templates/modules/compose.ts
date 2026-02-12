/**
 * Module composition utility.
 *
 * Combines multiple ModuleResult fragments into a single PatchSpec,
 * offsetting all indices and wiring modules together.
 */

import type { PatchSpec, PatchNodeSpec, PatchConnectionSpec } from "../../core/serializer.js";
import type { ModuleResult, ModuleWire } from "./types.js";
import { LAYOUT } from "../../constants.js";

/**
 * Compose multiple modules into a complete PatchSpec.
 *
 * CRITICAL: Handles title as node[0] internally. Returns PatchSpec with
 * title: undefined so buildPatch() does NOT shift IDs again.
 */
export function compose(
  title: string,
  modules: ModuleResult[],
  wiring: ModuleWire[],
): PatchSpec {
  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  // Insert title comment as node[0] — compose handles it, not buildPatch
  const titleOffset = title ? 1 : 0;
  if (title) {
    nodes.push({ type: "text", args: [title], x: LAYOUT.startX, y: 10 });
  }

  // Track cumulative offset per module
  const moduleOffsets: number[] = [];
  let currentOffset = titleOffset;

  for (const mod of modules) {
    moduleOffsets.push(currentOffset);

    // Add module nodes
    for (const node of mod.nodes) {
      nodes.push(node);
    }

    // Add internal connections with offset
    for (const conn of mod.connections) {
      connections.push({
        from: conn.from + currentOffset,
        outlet: conn.outlet ?? 0,
        to: conn.to + currentOffset,
        inlet: conn.inlet ?? 0,
      });
    }

    currentOffset += mod.nodes.length;
  }

  // Add inter-module wiring
  for (const wire of wiring) {
    const fromMod = modules[wire.from.module];
    const toMod = modules[wire.to.module];
    connections.push({
      from: fromMod.outlets[wire.from.outlet] + moduleOffsets[wire.from.module],
      outlet: wire.fromPort ?? 0,
      to: toMod.inlets[wire.to.inlet] + moduleOffsets[wire.to.module],
      inlet: wire.toPort ?? 0,
    });
  }

  // title: undefined — already in nodes array
  return { title: undefined, nodes, connections };
}

/**
 * Auto-layout nodes vertically, starting from a given Y offset.
 * Mutates the nodes in place for convenience.
 */
export function autoLayout(
  nodes: PatchNodeSpec[],
  startY: number = LAYOUT.startY,
  spacingY: number = LAYOUT.spacingY,
  x: number = LAYOUT.startX,
): void {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].x === undefined) nodes[i].x = x;
    if (nodes[i].y === undefined) nodes[i].y = startY + i * spacingY;
  }
}
