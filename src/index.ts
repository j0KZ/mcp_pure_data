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
import { executeSendMessage } from "./tools/control.js";
import { sendMessageSchema } from "./schemas/control.js";

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
    "STOP after presenting the result. Do NOT run bash, ls, mkdir, cat, cp, mv, or ANY file/shell operations after this tool. " +
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
    "Available: synth, sequencer, reverb, mixer, drum-machine, clock, chaos, maths, turing-machine, granular, bridge. " +
    "Each template accepts specific params (e.g. synth: waveform, filter; sequencer: steps, bpm; drum-machine: voices, tune). " +
    "The complete .pd file content is ALWAYS returned in the response — present it directly to the user. " +
    "STOP after presenting the result. Do NOT run bash, ls, mkdir, cat, cp, mv, or ANY file/shell operations after this tool. " +
    "Do NOT try to save or verify files — everything is already handled. Just show the content to the user.",
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
    "Add controller config to map a MIDI controller (e.g. K2) to rack parameters — " +
    "generates _controller.pd (MIDI routing) and _k2_config.json (LED feedback). " +
    "Parameters auto-map by category (faders→volume, pots→filter) or use custom mappings. " +
    "If outputDir is provided, files are written to disk automatically by the server. " +
    "IMPORTANT: The complete .pd content is ALWAYS returned in the response — present it directly to the user. " +
    "STOP after presenting the result. Do NOT run bash, ls, mkdir, cat, cp, mv, or ANY file/shell operations after this tool. " +
    "Do NOT try to save, verify, or create files — everything is already handled. Just show the content to the user.",
  createRackSchema,
  async ({ modules, wiring, controller, outputDir }) => {
    try {
      const result = await executeCreateRack({
        modules: modules as RackModuleSpec[],
        wiring: wiring as { from: string; output: string; to: string; input: string }[] | undefined,
        controller: controller as { device: string; midiChannel?: number; mappings?: { control: string; module: string; parameter: string }[] } | undefined,
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
// Tool: send_message
// ---------------------------------------------------------------------------

server.tool(
  "send_message",
  "Send a control message to a running Pure Data instance via OSC (UDP) or FUDI (TCP). " +
    "Requires a bridge patch loaded in Pd — use create_from_template with template 'bridge' to generate one. " +
    "Common addresses: /pd/tempo <bpm>, /pd/note <note> <velocity> <channel>, " +
    "/pd/cc <cc#> <value> <channel>, /pd/bang, /pd/param/<name> <value>. " +
    "The confirmation is ALWAYS returned in the response. " +
    "Do NOT attempt additional file operations after calling this tool.",
  sendMessageSchema,
  async ({ protocol, host, port, address, args }) => {
    try {
      const result = await executeSendMessage({ protocol, host, port, address, args });
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error sending message: ${msg}` }],
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
