/**
 * Zod schemas for MCP tool input validation.
 */

import { z } from "zod";

/** Schema for parse_patch tool. */
export const ParsePatchInput = z.object({
  /** Absolute file path to a .pd file, or raw .pd text content. */
  source: z
    .string()
    .min(1)
    .describe(
      "Absolute file path to a .pd file, or raw .pd text content. " +
        "If it starts with '#N canvas' it is treated as raw text."
    ),
});
export type ParsePatchInput = z.infer<typeof ParsePatchInput>;

/** Schema for a single node in a patch spec. */
const NodeSpec = z.object({
  name: z.string().optional().describe("Object name (e.g. 'osc~', 'metro'). Omit for msg/text types."),
  type: z
    .enum(["obj", "msg", "floatatom", "symbolatom", "text"])
    .default("obj")
    .describe("Node type. Defaults to 'obj'."),
  args: z
    .array(z.union([z.string(), z.number()]))
    .default([])
    .describe("Arguments for the object."),
  x: z.number().optional().describe("X position override."),
  y: z.number().optional().describe("Y position override."),
});

/** Schema for a connection in a patch spec. */
const ConnectionSpec = z.object({
  from: z.number().int().min(0).describe("Source node index (0-based)."),
  outlet: z.number().int().min(0).default(0).describe("Source outlet (default 0)."),
  to: z.number().int().min(0).describe("Destination node index (0-based)."),
  inlet: z.number().int().min(0).default(0).describe("Destination inlet (default 0)."),
});

/** Schema for generate_patch tool. */
export const GeneratePatchInput = z.object({
  /** Optional title comment for the patch. */
  title: z.string().optional().describe("Title comment placed at the top of the patch."),
  /** List of nodes to create. */
  nodes: z
    .array(NodeSpec)
    .min(1)
    .describe("List of nodes (objects, messages, etc.) to place in the patch."),
  /** List of connections between nodes. */
  connections: z
    .array(ConnectionSpec)
    .default([])
    .describe("Connections between nodes."),
  /** If set, write the .pd file to this path. Otherwise return content only. */
  outputPath: z
    .string()
    .optional()
    .describe("Optional file path to write the generated .pd file to."),
});
export type GeneratePatchInput = z.infer<typeof GeneratePatchInput>;
