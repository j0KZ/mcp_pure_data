/**
 * Pure Data AST → .pd text serializer.
 *
 * Strategy: walk the AST depth-first and reconstruct the .pd format.
 * Prioritizes round-trip fidelity by using `node.raw` when available.
 */

import type { PdPatch, PdCanvas, PdNode, PdConnection } from "../types.js";
import { LAYOUT } from "../constants.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a PdPatch AST back to .pd text format.
 */
export function serializePatch(patch: PdPatch): string {
  const lines: string[] = [];
  serializeCanvas(patch.root, lines);
  return lines.join("\n") + "\n";
}

/**
 * Build a PdPatch AST programmatically from a simplified spec and serialize it.
 * This is used by the generate_patch tool for creating patches from descriptions.
 */
export function buildPatch(spec: PatchSpec): string {
  const patch = buildPatchFromSpec(spec);
  return serializePatch(patch);
}

// ---------------------------------------------------------------------------
// Canvas serialization (recursive for subpatches)
// ---------------------------------------------------------------------------

function serializeCanvas(canvas: PdCanvas, lines: string[]): void {
  // Canvas header
  if (canvas.isSubpatch) {
    lines.push(
      `#N canvas ${canvas.x} ${canvas.y} ${canvas.width} ${canvas.height} ${canvas.name ?? "subpatch"} 0;`
    );
  } else {
    lines.push(
      `#N canvas ${canvas.x} ${canvas.y} ${canvas.width} ${canvas.height} ${canvas.fontSize};`
    );
  }

  // Track which nodes are subpatch placeholders so we can
  // interleave subpatch definitions at the right position.
  const subpatchMap = new Map<number, PdCanvas>();
  let subpatchIdx = 0;
  for (const node of canvas.nodes) {
    if (node.name === "pd" && subpatchIdx < canvas.subpatches.length) {
      subpatchMap.set(node.id, canvas.subpatches[subpatchIdx]);
      subpatchIdx++;
    }
  }

  // Nodes
  for (const node of canvas.nodes) {
    // If this node is a subpatch reference, emit the subpatch body first
    const subCanvas = subpatchMap.get(node.id);
    if (subCanvas) {
      serializeCanvas(subCanvas, lines);
      // Then emit the #X restore line
      lines.push(`${node.raw};`);
    } else {
      lines.push(`${node.raw};`);
    }
  }

  // Connections
  for (const conn of canvas.connections) {
    lines.push(
      `#X connect ${conn.fromNode} ${conn.fromOutlet} ${conn.toNode} ${conn.toInlet};`
    );
  }
}

// ---------------------------------------------------------------------------
// Patch builder (from simplified spec)
// ---------------------------------------------------------------------------

export interface PatchNodeSpec {
  /** Object name (e.g. "osc~", "metro", "dac~"). For messages use type "msg". */
  name?: string;
  /** Node type. Defaults to "obj". */
  type?: "obj" | "msg" | "floatatom" | "symbolatom" | "text";
  /** Arguments for the object. */
  args?: (string | number)[];
  /** X position override. Auto-laid-out if omitted. */
  x?: number;
  /** Y position override. Auto-laid-out if omitted. */
  y?: number;
}

export interface PatchConnectionSpec {
  /** Source node index (0-based). */
  from: number;
  /** Source outlet (default 0). */
  outlet?: number;
  /** Destination node index (0-based). */
  to: number;
  /** Destination inlet (default 0). */
  inlet?: number;
}

export interface PatchSpec {
  /** Canvas title / comment. */
  title?: string;
  /** List of nodes to create. */
  nodes: PatchNodeSpec[];
  /** List of connections between nodes. */
  connections: PatchConnectionSpec[];
}

function buildPatchFromSpec(spec: PatchSpec): PdPatch {
  const nodes: PdNode[] = spec.nodes.map((nspec, idx) => {
    const type = nspec.type ?? "obj";
    const x = nspec.x ?? LAYOUT.startX;
    const y = nspec.y ?? LAYOUT.startY + idx * LAYOUT.spacingY;
    const args = nspec.args ?? [];
    const name = nspec.name;

    let raw: string;
    if (type === "obj" && name) {
      const argStr = args.length > 0 ? " " + args.join(" ") : "";
      raw = `#X obj ${x} ${y} ${name}${argStr}`;
    } else if (type === "msg") {
      // Auto-escape Pd special characters in message args.
      // AI clients may pass bare "," instead of "\," for message separators.
      const escaped = args.map((a) => {
        if (typeof a === "string") {
          if (a === ",") return "\\,";
          if (a === ";") return "\\;";
        }
        return a;
      });
      const content = escaped.join(" ");
      raw = `#X msg ${x} ${y} ${content}`;
    } else if (type === "floatatom") {
      const argStr = args.length > 0 ? " " + args.join(" ") : "";
      raw = `#X floatatom ${x} ${y}${argStr}`;
    } else if (type === "symbolatom") {
      const argStr = args.length > 0 ? " " + args.join(" ") : "";
      raw = `#X symbolatom ${x} ${y}${argStr}`;
    } else if (type === "text") {
      const content = args.join(" ");
      raw = `#X text ${x} ${y} ${content}`;
    } else {
      const argStr = args.length > 0 ? " " + args.join(" ") : "";
      raw = `#X obj ${x} ${y}${name ? " " + name : ""}${argStr}`;
    }

    return {
      id: idx,
      type,
      x,
      y,
      name,
      args,
      raw,
    };
  });

  const connections: PdConnection[] = spec.connections.map((cspec) => ({
    fromNode: cspec.from,
    fromOutlet: cspec.outlet ?? 0,
    toNode: cspec.to,
    toInlet: cspec.inlet ?? 0,
  }));

  // Add title comment if provided
  if (spec.title) {
    const commentNode: PdNode = {
      id: nodes.length,
      type: "text",
      x: LAYOUT.startX,
      y: 10,
      args: [spec.title],
      raw: `#X text ${LAYOUT.startX} 10 ${spec.title}`,
    };
    // Prepend comment — shift all node ids and connection references
    for (const n of nodes) n.id += 1;
    for (const c of connections) {
      c.fromNode += 1;
      c.toNode += 1;
    }
    commentNode.id = 0;
    nodes.unshift(commentNode);
  }

  const root: PdCanvas = {
    id: 0,
    x: 0,
    y: 50,
    width: LAYOUT.canvasWidth,
    height: LAYOUT.canvasHeight,
    fontSize: LAYOUT.fontSize,
    isSubpatch: false,
    nodes,
    connections,
    subpatches: [],
  };

  return { root };
}
