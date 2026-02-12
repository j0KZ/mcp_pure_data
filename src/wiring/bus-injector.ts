/**
 * Bus injector — wires modules together in a combined rack patch.
 *
 * Audio buses use throw~/catch~ (signal rate).
 * Control buses use send/receive (message rate).
 *
 * Connection redirection approach: never removes nodes (which would shift
 * indices), only adds/removes/redirects connection entries.
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { PortInfo } from "../templates/port-info.js";

/** A single wire specification from the user. */
export interface WireSpec {
  from: string;
  output: string;
  to: string;
  input: string;
}

/** Module info needed for wiring (built during rack layout). */
export interface WiringModule {
  id: string;
  ports: PortInfo[];
  nodeOffset: number;
}

// ─── Connection helpers ──────────────────────────────────

/** Remove all connections TO a given node (in-place). */
export function removeConnectionsTo(
  conns: PatchConnectionSpec[],
  nodeIdx: number,
): void {
  for (let i = conns.length - 1; i >= 0; i--) {
    if (conns[i].from === nodeIdx || conns[i].to === nodeIdx) {
      // Only remove connections where the node is the DESTINATION
      if (conns[i].to === nodeIdx) {
        conns.splice(i, 1);
      }
    }
  }
}

/** Remove connections FROM a specific source TO a specific destination (in-place). */
export function removeConnectionsBetween(
  conns: PatchConnectionSpec[],
  fromIdx: number,
  toIdx: number,
): void {
  for (let i = conns.length - 1; i >= 0; i--) {
    if (conns[i].from === fromIdx && conns[i].to === toIdx) {
      conns.splice(i, 1);
    }
  }
}

/** Redirect all connections FROM oldFrom to come FROM newFrom instead. */
export function redirectConnectionsFrom(
  conns: PatchConnectionSpec[],
  oldFrom: number,
  newFrom: number,
): void {
  for (const conn of conns) {
    if (conn.from === oldFrom) {
      conn.from = newFrom;
    }
  }
}

// ─── Validation ──────────────────────────────────────────

function validateWiring(modules: WiringModule[], wiring: WireSpec[]): void {
  // Check module ID uniqueness
  const idSet = new Set<string>();
  for (const mod of modules) {
    if (idSet.has(mod.id)) {
      throw new Error(`Duplicate module ID "${mod.id}" in rack.`);
    }
    idSet.add(mod.id);
  }

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const inputTargets = new Set<string>();

  for (const wire of wiring) {
    // Module IDs exist
    const srcMod = moduleMap.get(wire.from);
    if (!srcMod) {
      throw new Error(
        `Wiring error: source module "${wire.from}" not found. Available: ${modules.map((m) => m.id).join(", ")}`,
      );
    }
    const dstMod = moduleMap.get(wire.to);
    if (!dstMod) {
      throw new Error(
        `Wiring error: destination module "${wire.to}" not found. Available: ${modules.map((m) => m.id).join(", ")}`,
      );
    }

    // No self-wiring
    if (wire.from === wire.to) {
      throw new Error(
        `Wiring error: module "${wire.from}" cannot be wired to itself.`,
      );
    }

    // Port names exist with correct direction
    const srcPort = srcMod.ports.find(
      (p) => p.name === wire.output && p.direction === "output",
    );
    if (!srcPort) {
      const available = srcMod.ports
        .filter((p) => p.direction === "output")
        .map((p) => p.name);
      throw new Error(
        `Wiring error: output port "${wire.output}" not found on module "${wire.from}". Available outputs: ${available.join(", ") || "(none)"}`,
      );
    }

    const dstPort = dstMod.ports.find(
      (p) => p.name === wire.input && p.direction === "input",
    );
    if (!dstPort) {
      const available = dstMod.ports
        .filter((p) => p.direction === "input")
        .map((p) => p.name);
      throw new Error(
        `Wiring error: input port "${wire.input}" not found on module "${wire.to}". Available inputs: ${available.join(", ") || "(none)"}`,
      );
    }

    // Type matching
    if (srcPort.type !== dstPort.type) {
      throw new Error(
        `Wiring error: type mismatch — "${wire.from}.${wire.output}" is ${srcPort.type} but "${wire.to}.${wire.input}" is ${dstPort.type}.`,
      );
    }

    // No duplicate inputs
    const inputKey = `${wire.to}::${wire.input}`;
    if (inputTargets.has(inputKey)) {
      throw new Error(
        `Wiring error: duplicate input — "${wire.to}.${wire.input}" is already wired.`,
      );
    }
    inputTargets.add(inputKey);
  }
}

// ─── Main wiring function ────────────────────────────────

/**
 * Apply inter-module wiring to a combined rack patch.
 *
 * Mutates `allNodes` and `allConnections` in place:
 * - Appends throw~/catch~ or send/receive nodes
 * - Removes/redirects connections as needed
 */
export function applyWiring(
  allNodes: PatchNodeSpec[],
  allConnections: PatchConnectionSpec[],
  modules: WiringModule[],
  wiring: WireSpec[],
): void {
  if (!wiring || wiring.length === 0) return;

  validateWiring(modules, wiring);

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  // Track created audio buses for fan-out: busName → catchIdx
  const audioBuses = new Map<string, { throwIdx: number; catchIdx: number }>();
  // Track which source ioNodes have been disconnected (avoid double-disconnect)
  const disconnectedOutputs = new Set<number>();

  for (const wire of wiring) {
    const srcMod = moduleMap.get(wire.from)!;
    const dstMod = moduleMap.get(wire.to)!;

    const srcPort = srcMod.ports.find(
      (p) => p.name === wire.output && p.direction === "output",
    )!;
    const dstPort = dstMod.ports.find(
      (p) => p.name === wire.input && p.direction === "input",
    )!;

    const fromAbsolute = srcPort.nodeIndex + srcMod.nodeOffset;
    const toAbsolute = dstPort.nodeIndex + dstMod.nodeOffset;
    const ioFromAbsolute =
      srcPort.ioNodeIndex !== undefined
        ? srcPort.ioNodeIndex + srcMod.nodeOffset
        : undefined;
    const ioToAbsolute =
      dstPort.ioNodeIndex !== undefined
        ? dstPort.ioNodeIndex + dstMod.nodeOffset
        : undefined;

    const busName = `${wire.from}__${wire.output}`;

    if (srcPort.type === "audio") {
      let catchIdx: number;

      if (!audioBuses.has(busName)) {
        // First wire from this source: disconnect ioNode and create throw~/catch~
        if (ioFromAbsolute !== undefined && !disconnectedOutputs.has(ioFromAbsolute)) {
          removeConnectionsTo(allConnections, ioFromAbsolute);
          disconnectedOutputs.add(ioFromAbsolute);
        }

        // Add throw~ node
        const throwIdx = allNodes.length;
        allNodes.push({ name: "throw~", args: [busName], x: 50, y: 10 });
        allConnections.push({
          from: fromAbsolute,
          outlet: srcPort.port,
          to: throwIdx,
          inlet: 0,
        });

        // Add catch~ node
        catchIdx = allNodes.length;
        allNodes.push({ name: "catch~", args: [busName], x: 50, y: 40 });

        audioBuses.set(busName, { throwIdx, catchIdx });
      } else {
        // Fan-out: reuse existing catch~
        catchIdx = audioBuses.get(busName)!.catchIdx;
      }

      // Wire catch~ to destination
      if (ioToAbsolute !== undefined) {
        // Redirect all connections from ioNode to come from catch~ instead
        redirectConnectionsFrom(allConnections, ioToAbsolute, catchIdx);
      } else {
        // Additive: connect catch~ directly to target
        allConnections.push({
          from: catchIdx,
          outlet: 0,
          to: toAbsolute,
          inlet: dstPort.port,
        });
      }
    } else {
      // Control bus: send/receive
      if (ioFromAbsolute !== undefined && !disconnectedOutputs.has(ioFromAbsolute)) {
        removeConnectionsTo(allConnections, ioFromAbsolute);
        disconnectedOutputs.add(ioFromAbsolute);
      }

      // Add send node
      const sendIdx = allNodes.length;
      allNodes.push({ name: "send", args: [busName], x: 50, y: 10 });
      allConnections.push({
        from: fromAbsolute,
        outlet: srcPort.port,
        to: sendIdx,
        inlet: 0,
      });

      // Add receive node
      const receiveIdx = allNodes.length;
      allNodes.push({ name: "receive", args: [busName], x: 50, y: 40 });

      if (ioToAbsolute !== undefined) {
        // Disconnect the ioNode from its target and wire receive instead
        removeConnectionsBetween(allConnections, ioToAbsolute, toAbsolute);
        allConnections.push({
          from: receiveIdx,
          outlet: 0,
          to: toAbsolute,
          inlet: dstPort.port,
        });
      } else {
        // Additive: connect receive directly to target
        allConnections.push({
          from: receiveIdx,
          outlet: 0,
          to: toAbsolute,
          inlet: dstPort.port,
        });
      }
    }
  }
}
