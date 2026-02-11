#!/usr/bin/env node

/**
 * puredata-mcp-server — MCP entry point.
 *
 * Registers tools and starts the stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { executeParsePatch } from "./tools/parse.js";
import { executeGeneratePatch, formatGenerateResult } from "./tools/generate.js";

const server = new McpServer({
  name: "puredata-mcp-server",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: parse_patch
// ---------------------------------------------------------------------------

server.tool(
  "parse_patch",
  "Parse a Pure Data .pd file and return a structured description of its objects, connections, and signal flow.",
  {
    source: z
      .string()
      .min(1)
      .describe(
        "Absolute file path to a .pd file, or raw .pd text content. " +
          "If it starts with '#N canvas' it is treated as raw text."
      ),
  },
  async ({ source }) => {
    try {
      const result = await executeParsePatch(source);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error parsing patch: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: generate_patch
// ---------------------------------------------------------------------------

server.tool(
  "generate_patch",
  "Generate a valid Pure Data .pd file from a JSON specification of nodes and connections.",
  {
    title: z.string().optional().describe("Title comment placed at the top of the patch."),
    nodes: z
      .array(
        z.object({
          name: z.string().optional().describe("Object name (e.g. 'osc~', 'metro')."),
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
        }),
      )
      .min(1)
      .describe("List of nodes to place in the patch."),
    connections: z
      .array(
        z.object({
          from: z.number().int().min(0).describe("Source node index (0-based)."),
          outlet: z.number().int().min(0).default(0).describe("Source outlet."),
          to: z.number().int().min(0).describe("Destination node index."),
          inlet: z.number().int().min(0).default(0).describe("Destination inlet."),
        }),
      )
      .default([])
      .describe("Connections between nodes."),
    outputPath: z
      .string()
      .optional()
      .describe("Optional file path to write the generated .pd file to."),
  },
  async ({ title, nodes, connections, outputPath }) => {
    try {
      const result = await executeGeneratePatch({
        title,
        nodes,
        connections,
        outputPath,
      });
      const text = formatGenerateResult(result);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error generating patch: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
