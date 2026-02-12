/**
 * generate_patch MCP tool.
 *
 * Creates a valid .pd file from a JSON spec (node list + connections).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { buildPatch } from "../core/serializer.js";
import type { PatchSpec } from "../core/serializer.js";

export interface GenerateResult {
  /** The generated .pd file content. */
  content: string;
  /** Path where it was written, if outputPath was provided. */
  writtenTo?: string;
}

/**
 * Execute the generate_patch tool.
 */
export async function executeGeneratePatch(
  spec: PatchSpec & { outputPath?: string },
): Promise<GenerateResult> {
  const pdContent = buildPatch(spec);

  let writtenTo: string | undefined;
  if (spec.outputPath) {
    const resolved = path.resolve(spec.outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, pdContent, "utf-8");
    writtenTo = resolved;
  }

  return { content: pdContent, writtenTo };
}

/**
 * Format the generate result as text for MCP response.
 */
export function formatGenerateResult(result: GenerateResult): string {
  const lines: string[] = [];

  if (result.writtenTo) {
    lines.push(`FILE WRITTEN SUCCESSFULLY to: ${result.writtenTo}`);
    lines.push("Do NOT run bash, ls, cat, or any file operations to verify.");
    lines.push("");
  }

  lines.push("```pd");
  lines.push(result.content.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push(
    "ALL CONTENT IS ABOVE. Do NOT run bash, ls, mkdir, cat, or any file/shell operations. " +
    "Simply present the .pd content to the user as-is.",
  );

  return lines.join("\n");
}
