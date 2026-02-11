/**
 * Pure Data .pd file parser.
 *
 * Reads .pd text and produces a PdPatch AST.
 *
 * Strategy:
 * 1. Split input into logical statements (delimited by ";")
 * 2. Handle multi-line statements (concatenate until ";" found)
 * 3. Use a canvas stack to track nesting (subpatches)
 * 4. Maintain a per-canvas node index counter
 */

import type { PdPatch, PdCanvas, PdNode, PdConnection, PdNodeType } from "../types.js";
import { PD_INDEXABLE_TYPES } from "../constants.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .pd file's text content into a PdPatch AST.
 * @throws {Error} if the file has no root canvas or is structurally invalid.
 */
export function parsePatch(source: string): PdPatch {
  const statements = splitStatements(source);
  const ctx = new ParseContext();

  for (const stmt of statements) {
    parseStatement(stmt, ctx);
  }

  if (!ctx.root) {
    throw new Error("Invalid .pd file: no root canvas (#N canvas) found");
  }

  return { root: ctx.root };
}

// ---------------------------------------------------------------------------
// Internal: statement splitting
// ---------------------------------------------------------------------------

/**
 * Split source text into statements separated by ";".
 * Handles escaped semicolons (\;) inside messages by not splitting on them.
 * Returns trimmed, non-empty statements WITHOUT the trailing semicolon.
 */
function splitStatements(source: string): string[] {
  const results: string[] = [];
  let current = "";

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    // Escaped semicolon — keep literal \;
    if (ch === "\\" && i + 1 < source.length && source[i + 1] === ";") {
      current += "\\;";
      i++; // skip the ";"
      continue;
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        results.push(trimmed);
      }
      current = "";
      continue;
    }

    current += ch;
  }

  // Handle trailing content without semicolon
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    results.push(trimmed);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal: parse context (canvas stack)
// ---------------------------------------------------------------------------

class ParseContext {
  root: PdCanvas | null = null;
  /** Stack of canvases. Top = current canvas being populated. */
  private canvasStack: PdCanvas[] = [];
  /** Auto-incrementing canvas id. */
  private nextCanvasId = 0;

  get current(): PdCanvas | null {
    return this.canvasStack.length > 0
      ? this.canvasStack[this.canvasStack.length - 1]
      : null;
  }

  pushCanvas(canvas: PdCanvas): void {
    if (this.canvasStack.length > 0) {
      // It's a subpatch — add as child of current canvas
      this.current!.subpatches.push(canvas);
    } else {
      // It's the root canvas
      this.root = canvas;
    }
    this.canvasStack.push(canvas);
  }

  popCanvas(): PdCanvas | null {
    return this.canvasStack.pop() ?? null;
  }

  allocCanvasId(): number {
    return this.nextCanvasId++;
  }
}

// ---------------------------------------------------------------------------
// Internal: statement dispatcher
// ---------------------------------------------------------------------------

function parseStatement(stmt: string, ctx: ParseContext): void {
  // Normalize whitespace (replace newlines/tabs with spaces)
  const normalized = stmt.replace(/[\r\n\t]+/g, " ");

  if (normalized.startsWith("#N canvas")) {
    parseCanvasHeader(normalized, ctx);
  } else if (normalized.startsWith("#X")) {
    parseElement(normalized, ctx);
  } else if (normalized.startsWith("#A")) {
    parseArrayData(normalized, ctx);
  }
  // Ignore unknown line types (comments, etc.)
}

// ---------------------------------------------------------------------------
// #N canvas — canvas/subpatch header
// ---------------------------------------------------------------------------

function parseCanvasHeader(stmt: string, ctx: ParseContext): void {
  // #N canvas <x> <y> <width> <height> <fontSize> [<name>] [<visible>]
  const parts = stmt.split(/\s+/);
  // parts: ["#N", "canvas", x, y, w, h, fontSize, name?, visible?]

  const x = parseInt(parts[2], 10) || 0;
  const y = parseInt(parts[3], 10) || 0;
  const width = parseInt(parts[4], 10) || 800;
  const height = parseInt(parts[5], 10) || 600;
  const fontSizeOrName = parts[6];

  let fontSize = 12;
  let name: string | undefined;

  // If there's a 7th part, it could be fontSize (number) or name (for subpatches).
  // Root canvas: #N canvas 0 50 800 600 12;
  // Subpatch:    #N canvas 0 50 450 300 myname 0;
  // BUT some subpatches: #N canvas 0 50 450 300 12;  (unnamed)
  // The convention: if the current stack is non-empty, the 7th token is the font size
  // and the optional 8th is the subpatch name. Actually, looking at Pd format more carefully:
  // Root:     #N canvas X Y W H FONTSIZE;
  // Subpatch: #N canvas X Y W H NAME VIS;
  // The disambiguator is context: if we already have a root, this is a subpatch.

  const isSubpatch = ctx.root !== null;

  if (isSubpatch) {
    // For subpatches: #N canvas X Y W H NAME VIS;
    // But some have no name, just a font size. We check if fontSizeOrName is a number.
    if (fontSizeOrName !== undefined && isNaN(Number(fontSizeOrName))) {
      name = fontSizeOrName;
      fontSize = 12; // subpatches use parent font
    } else {
      fontSize = parseInt(fontSizeOrName, 10) || 12;
      name = parts[7]; // might be undefined
    }
  } else {
    fontSize = parseInt(fontSizeOrName, 10) || 12;
  }

  const canvas: PdCanvas = {
    id: ctx.allocCanvasId(),
    x,
    y,
    width,
    height,
    fontSize,
    name,
    isSubpatch,
    nodes: [],
    connections: [],
    subpatches: [],
  };

  ctx.pushCanvas(canvas);
}

// ---------------------------------------------------------------------------
// #X — element (obj, msg, connect, restore, etc.)
// ---------------------------------------------------------------------------

function parseElement(stmt: string, ctx: ParseContext): void {
  // #X <type> <rest...>
  const afterHash = stmt.substring(3); // skip "#X "
  const spaceIdx = afterHash.indexOf(" ");
  const type = spaceIdx === -1 ? afterHash : afterHash.substring(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : afterHash.substring(spaceIdx + 1);

  const canvas = ctx.current;
  if (!canvas) {
    throw new Error(`Element found outside canvas: ${stmt}`);
  }

  if (type === "connect") {
    parseConnection(rest, canvas);
  } else if (type === "restore") {
    parseRestore(rest, stmt, ctx);
  } else if (type === "coords") {
    // Graph-on-parent coords — ignore for now
    return;
  } else if (PD_INDEXABLE_TYPES.has(type)) {
    parseNode(type as PdNodeType, rest, stmt, canvas);
  } else {
    // Unknown #X type — store as generic node so we don't lose data
    parseNode(type as PdNodeType, rest, stmt, canvas);
  }
}

// ---------------------------------------------------------------------------
// Node parsing (obj, msg, floatatom, symbolatom, text, array)
// ---------------------------------------------------------------------------

function parseNode(
  type: PdNodeType,
  rest: string,
  raw: string,
  canvas: PdCanvas,
): void {
  const tokens = tokenize(rest);

  const x = parseNumber(tokens[0]) ?? 0;
  const y = parseNumber(tokens[1]) ?? 0;

  let name: string | undefined;
  let args: (string | number)[] = [];

  if (type === "obj" && tokens.length > 2) {
    name = tokens[2];
    args = tokens.slice(3).map(coerceToken);
  } else if (type === "msg") {
    // Everything after x y is the message content
    args = tokens.slice(2).map(coerceToken);
  } else if (type === "floatatom" || type === "symbolatom") {
    // floatatom/symbolatom have many positional params after x y
    args = tokens.slice(2).map(coerceToken);
  } else if (type === "text") {
    // Comment text — everything after x y
    args = tokens.slice(2).map(coerceToken);
  } else if (type === "array") {
    // #X array name size type flags
    if (tokens.length > 2) name = tokens[2];
    args = tokens.slice(3).map(coerceToken);
  } else {
    // Fallback for unknown types
    args = tokens.slice(2).map(coerceToken);
  }

  const node: PdNode = {
    id: canvas.nodes.length,
    type,
    x,
    y,
    name,
    args,
    raw,
  };

  canvas.nodes.push(node);
}

// ---------------------------------------------------------------------------
// Connection parsing
// ---------------------------------------------------------------------------

function parseConnection(rest: string, canvas: PdCanvas): void {
  // <fromNode> <fromOutlet> <toNode> <toInlet>
  const tokens = rest.trim().split(/\s+/);
  if (tokens.length < 4) return;

  const conn: PdConnection = {
    fromNode: parseInt(tokens[0], 10),
    fromOutlet: parseInt(tokens[1], 10),
    toNode: parseInt(tokens[2], 10),
    toInlet: parseInt(tokens[3], 10),
  };

  canvas.connections.push(conn);
}

// ---------------------------------------------------------------------------
// Restore (close subpatch)
// ---------------------------------------------------------------------------

function parseRestore(rest: string, raw: string, ctx: ParseContext): void {
  // #X restore <x> <y> pd <name>
  // This closes the current subpatch canvas and adds a placeholder node
  // in the parent canvas so connections can reference the subpatch.
  const tokens = tokenize(rest);
  const x = parseNumber(tokens[0]) ?? 0;
  const y = parseNumber(tokens[1]) ?? 0;

  // Pop the subpatch canvas
  const subpatchCanvas = ctx.popCanvas();

  // The parent canvas gets a node representing the closed subpatch
  const parent = ctx.current;
  if (parent && subpatchCanvas) {
    // Extract the subpatch name (tokens after "pd")
    const pdIdx = tokens.indexOf("pd");
    const subName = pdIdx >= 0 ? tokens.slice(pdIdx + 1).join(" ") : undefined;

    if (subName && !subpatchCanvas.name) {
      subpatchCanvas.name = subName;
    }

    const node: PdNode = {
      id: parent.nodes.length,
      type: "obj",
      x,
      y,
      name: "pd",
      args: subName ? [subName] : [],
      raw,
    };
    parent.nodes.push(node);
  }
}

// ---------------------------------------------------------------------------
// #A — array data (store on last array node)
// ---------------------------------------------------------------------------

function parseArrayData(stmt: string, ctx: ParseContext): void {
  // #A <offset> <val1> <val2> ...
  // For now we preserve the raw line but don't parse values into the AST.
  // This keeps round-trip fidelity simple.
  const canvas = ctx.current;
  if (!canvas) return;

  // Find the last array node and append to its raw
  for (let i = canvas.nodes.length - 1; i >= 0; i--) {
    if (canvas.nodes[i].type === "array") {
      canvas.nodes[i].raw += ";\n" + stmt;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a string respecting Pd conventions.
 * Simple whitespace split — sufficient for .pd format.
 */
function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** Try to parse a token as a number, return undefined if it fails. */
function parseNumber(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const n = Number(token);
  return isNaN(n) ? undefined : n;
}

/** Coerce a token to number if it looks numeric, otherwise keep as string. */
function coerceToken(token: string): string | number {
  const n = Number(token);
  return isNaN(n) ? token : n;
}
