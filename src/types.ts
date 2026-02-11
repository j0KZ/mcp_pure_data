/**
 * Type definitions for the Pure Data AST.
 *
 * A .pd file is represented as a PdPatch containing one root canvas
 * and potentially nested subpatch canvases.
 */

// ---------------------------------------------------------------------------
// Nodes (objects, messages, atoms, comments, arrays, GUI elements)
// ---------------------------------------------------------------------------

export type PdNodeType =
  | "obj"
  | "msg"
  | "floatatom"
  | "symbolatom"
  | "text"
  | "array"
  | "restore";

export interface PdNode {
  /** 0-based index within the parent canvas (order of appearance). */
  id: number;
  /** The element type as it appears after #X in the .pd file. */
  type: PdNodeType;
  /** X position in pixels. */
  x: number;
  /** Y position in pixels. */
  y: number;
  /**
   * Object name (e.g. "osc~", "metro", "notein").
   * Only present for type "obj". For "msg" / "text" this is undefined.
   */
  name?: string;
  /** Arguments after the object name, parsed to strings and numbers. */
  args: (string | number)[];
  /** The complete original line(s) from the .pd file, without trailing semicolon. */
  raw: string;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export interface PdConnection {
  /** Index of source node in the parent canvas. */
  fromNode: number;
  /** Outlet index on the source node (0 = leftmost). */
  fromOutlet: number;
  /** Index of destination node in the parent canvas. */
  toNode: number;
  /** Inlet index on the destination node (0 = leftmost). */
  toInlet: number;
}

// ---------------------------------------------------------------------------
// Canvas (top-level or subpatch)
// ---------------------------------------------------------------------------

export interface PdCanvas {
  /** Unique id across all canvases in the patch. */
  id: number;
  /** X position of the canvas window. */
  x: number;
  /** Y position of the canvas window. */
  y: number;
  /** Window width in pixels. */
  width: number;
  /** Window height in pixels. */
  height: number;
  /** Font size declared in the canvas header. */
  fontSize: number;
  /** Name of the subpatch (e.g. "pd myfilter"). Undefined for root canvas. */
  name?: string;
  /** True if this canvas is a subpatch (has a matching #X restore). */
  isSubpatch: boolean;
  /** Ordered list of nodes in this canvas. */
  nodes: PdNode[];
  /** Connections between nodes in this canvas. */
  connections: PdConnection[];
  /** Nested subpatch canvases (children). */
  subpatches: PdCanvas[];
}

// ---------------------------------------------------------------------------
// Patch (top-level container)
// ---------------------------------------------------------------------------

export interface PdPatch {
  /** The root canvas (every .pd file has exactly one root canvas). */
  root: PdCanvas;
}
