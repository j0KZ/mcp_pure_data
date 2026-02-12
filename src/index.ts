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
import { executeValidatePatch } from "./tools/validate.js";
import { executeAnalyzePatch } from "./tools/analyze.js";
import { executeCreateFromTemplate } from "./tools/template.js";
import { createFromTemplateSchema } from "./schemas/template.js";
import { executeCreateRack, type RackModuleSpec } from "./tools/rack.js";
import { createRackSchema } from "./schemas/rack.js";

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
  "Generate a valid Pure Data .pd file from a JSON specification of nodes and connections. " +
    "The complete .pd file content is ALWAYS returned in the response — present it directly to the user. " +
    "Do NOT attempt additional file operations (cp, mv, search) after calling this tool. " +
    "For message boxes (type: 'msg'), use '\\\\,' as a separate arg for multi-segment messages " +
    "(e.g. ADSR: args: [0, '\\\\,', 1, 10, '\\\\,', 0.7, 100, '\\\\,', 0, 200]). Bare commas are auto-escaped.",
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
      .describe(
        "Optional ABSOLUTE file path to write the .pd file. " +
          "Only use if the user explicitly requests saving to a specific path. " +
          "The .pd content is always returned in the response regardless.",
      ),
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
// Tool: validate_patch
// ---------------------------------------------------------------------------

server.tool(
  "validate_patch",
  "Validate a Pure Data .pd file for structural issues: broken connections, orphan objects, unknown objects, missing DSP sinks.",
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
      const result = await executeValidatePatch(source);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error validating patch: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: analyze_patch
// ---------------------------------------------------------------------------

server.tool(
  "analyze_patch",
  "Analyze a Pure Data .pd file: object counts by category, signal flow graph, DSP chain detection, complexity scoring, and validation.",
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
      const result = await executeAnalyzePatch(source);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error analyzing patch: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: create_from_template
// ---------------------------------------------------------------------------

server.tool(
  "create_from_template",
  "Generate a Pd patch from a parameterized template. " +
    "Available: synth, sequencer, reverb, mixer, drum-machine, clock, chaos, maths, turing-machine, granular. " +
    "Each template accepts specific params (e.g. synth: waveform, filter; sequencer: steps, bpm; drum-machine: voices, tune). " +
    "The complete .pd file content is ALWAYS returned in the response — present it directly to the user. " +
    "Do NOT attempt additional file operations after calling this tool.",
  createFromTemplateSchema,
  async ({ template, params, outputPath }) => {
    try {
      const result = await executeCreateFromTemplate({
        template,
        params: params as Record<string, unknown> | undefined,
        outputPath,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error creating from template: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: create_rack
// ---------------------------------------------------------------------------

server.tool(
  "create_rack",
  "Generate an entire Eurorack-style rack of Pd patches at once. " +
    "Takes an array of module specs (template + params) and generates: " +
    "individual .pd files for each module + a combined _rack.pd with all modules side-by-side. " +
    "Use wiring to connect modules via throw~/catch~ (audio) or send/receive (control) buses. " +
    "If outputDir is provided, files are written to that directory automatically. " +
    "IMPORTANT: The complete .pd content is ALWAYS returned in the response. " +
    "Do NOT run any file operations (ls, cp, mv, cat) after this tool — files are already written and content is already in the response.",
  createRackSchema,
  async ({ modules, wiring, outputDir }) => {
    try {
      const result = await executeCreateRack({
        modules: modules as RackModuleSpec[],
        wiring: wiring as { from: string; output: string; to: string; input: string }[] | undefined,
        outputDir,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error creating rack: ${msg}` }],
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
