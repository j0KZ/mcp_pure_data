/**
 * parse_patch MCP tool.
 *
 * Reads a .pd file (from disk or raw text) and returns a structured description.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parsePatch } from "../core/parser.js";
import type { PdPatch, PdCanvas, PdNode } from "../types.js";

/**
 * Execute the parse_patch tool.
 * @param source - file path or raw .pd text
 * @returns Structured text description of the patch
 */
export async function executeParsePatch(source: string): Promise<string> {
  let pdText: string;
  let filePath: string | undefined;

  if (source.trimStart().startsWith("#N canvas") || source.trimStart().startsWith("#N")) {
    // Raw .pd text
    pdText = source;
  } else {
    // File path
    filePath = path.resolve(source);
    pdText = await fs.readFile(filePath, "utf-8");
  }

  const patch = parsePatch(pdText);
  return formatPatch(patch, filePath);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPatch(patch: PdPatch, filePath?: string): string {
  const lines: string[] = [];

  if (filePath) {
    lines.push(`# Patch: ${path.basename(filePath)}`);
    lines.push(`Path: ${filePath}`);
    lines.push("");
  }

  lines.push(...formatCanvas(patch.root, 0));

  return lines.join("\n");
}

function formatCanvas(canvas: PdCanvas, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  const label = canvas.isSubpatch
    ? `Subpatch: ${canvas.name ?? "(unnamed)"}`
    : "Root Canvas";
  lines.push(`${indent}## ${label}`);
  lines.push(`${indent}Size: ${canvas.width}x${canvas.height}, Font: ${canvas.fontSize}`);
  lines.push("");

  // Summarize objects
  const objects = canvas.nodes.filter((n) => n.type === "obj");
  const messages = canvas.nodes.filter((n) => n.type === "msg");
  const comments = canvas.nodes.filter((n) => n.type === "text");

  lines.push(`${indent}**Objects** (${objects.length}):`);
  for (const obj of objects) {
    const argStr = obj.args.length > 0 ? ` ${obj.args.join(" ")}` : "";
    lines.push(`${indent}  [${obj.id}] ${obj.name ?? "?"}${argStr}`);
  }
  lines.push("");

  if (messages.length > 0) {
    lines.push(`${indent}**Messages** (${messages.length}):`);
    for (const msg of messages) {
      lines.push(`${indent}  [${msg.id}] ${msg.args.join(" ")}`);
    }
    lines.push("");
  }

  if (comments.length > 0) {
    lines.push(`${indent}**Comments** (${comments.length}):`);
    for (const c of comments) {
      lines.push(`${indent}  [${c.id}] ${c.args.join(" ")}`);
    }
    lines.push("");
  }

  // Connections
  lines.push(`${indent}**Connections** (${canvas.connections.length}):`);
  for (const conn of canvas.connections) {
    const fromName = nodeLabel(canvas.nodes[conn.fromNode]);
    const toName = nodeLabel(canvas.nodes[conn.toNode]);
    lines.push(
      `${indent}  ${fromName}[${conn.fromOutlet}] → ${toName}[${conn.toInlet}]`
    );
  }
  lines.push("");

  // Subpatches
  for (const sub of canvas.subpatches) {
    lines.push(...formatCanvas(sub, depth + 1));
  }

  return lines;
}

function nodeLabel(node: PdNode | undefined): string {
  if (!node) return "?";
  if (node.type === "obj") return node.name ?? "obj";
  if (node.type === "msg") return `msg(${node.args.join(" ")})`;
  return node.type;
}
