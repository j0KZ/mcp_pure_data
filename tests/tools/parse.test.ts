/**
 * Tests for parse_patch tool handler.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { executeParsePatch } from "../../src/tools/parse.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");

function fixturePath(name: string): string {
  return path.join(FIXTURES, name);
}

describe("executeParsePatch", () => {
  // -----------------------------------------------------------------------
  // Basic parsing from raw text
  // -----------------------------------------------------------------------
  it("parses raw .pd text with objects and connections", async () => {
    const raw = `#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;`;
    const result = await executeParsePatch(raw);

    expect(result).toContain("Root Canvas");
    expect(result).toContain("800x600");
    expect(result).toContain("Font: 12");
    expect(result).toContain("osc~ 440");
    expect(result).toContain("*~ 0.1");
    expect(result).toContain("dac~");
    expect(result).toContain("Connections");
  });

  // -----------------------------------------------------------------------
  // Parsing from fixture file path
  // -----------------------------------------------------------------------
  it("parses from file path and includes filename in header", async () => {
    const result = await executeParsePatch(fixturePath("hello-world.pd"));

    expect(result).toContain("# Patch: hello-world.pd");
    expect(result).toContain("Path:");
    expect(result).toContain("Root Canvas");
  });

  // -----------------------------------------------------------------------
  // Object listing
  // -----------------------------------------------------------------------
  it("lists objects with id and args", async () => {
    const result = await executeParsePatch(fixturePath("hello-world.pd"));

    expect(result).toContain("**Objects** (3):");
    expect(result).toContain("[0] osc~ 440");
    expect(result).toContain("[1] *~ 0.1");
    expect(result).toContain("[2] dac~");
  });

  // -----------------------------------------------------------------------
  // Message listing
  // -----------------------------------------------------------------------
  it("lists messages when present", async () => {
    const raw = `#N canvas 0 50 800 600 12;
#X msg 50 50 bang;
#X obj 50 100 print;
#X connect 0 0 1 0;`;
    const result = await executeParsePatch(raw);

    expect(result).toContain("**Messages** (1):");
    expect(result).toContain("[0] bang");
  });

  // -----------------------------------------------------------------------
  // Comment listing
  // -----------------------------------------------------------------------
  it("lists comments when present", async () => {
    const raw = `#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X text 200 50 This is a comment;`;
    const result = await executeParsePatch(raw);

    expect(result).toContain("**Comments** (1):");
    expect(result).toContain("This is a comment");
  });

  // -----------------------------------------------------------------------
  // Connection formatting
  // -----------------------------------------------------------------------
  it("formats connections with node names and port indices", async () => {
    const result = await executeParsePatch(fixturePath("hello-world.pd"));

    // osc~[0] → *~[0]
    expect(result).toMatch(/osc~\[0\] → \*~\[0\]/);
    // *~[0] → dac~[0]
    expect(result).toMatch(/\*~\[0\] → dac~\[0\]/);
  });

  // -----------------------------------------------------------------------
  // nodeLabel for message nodes (tested indirectly)
  // -----------------------------------------------------------------------
  it("formats message nodes in connections as msg(...)", async () => {
    const raw = `#N canvas 0 50 800 600 12;
#X msg 50 50 440;
#X obj 50 100 osc~;
#X connect 0 0 1 0;`;
    const result = await executeParsePatch(raw);

    expect(result).toMatch(/msg\(440\)\[0\] → osc~\[0\]/);
  });

  // -----------------------------------------------------------------------
  // nodeLabel for text/comment nodes (tested indirectly)
  // -----------------------------------------------------------------------
  it("formats text nodes in connections with type name", async () => {
    // Unusual but valid: a text node with a connection
    const raw = `#N canvas 0 50 800 600 12;
#X text 50 50 hello;
#X obj 50 100 print;
#X connect 0 0 1 0;`;
    const result = await executeParsePatch(raw);

    expect(result).toMatch(/text\[0\] → print\[0\]/);
  });

  // -----------------------------------------------------------------------
  // nodeLabel for undefined node (connection to non-existent node)
  // -----------------------------------------------------------------------
  it("formats connection to non-existent node as ?", async () => {
    // broken-connections.pd has #X connect 0 0 9 0; where node 9 doesn't exist
    const result = await executeParsePatch(fixturePath("broken-connections.pd"));

    expect(result).toContain("?[0]");
  });

  // -----------------------------------------------------------------------
  // Subpatch formatting
  // -----------------------------------------------------------------------
  it("formats subpatches with indentation", async () => {
    const result = await executeParsePatch(fixturePath("subpatch.pd"));

    expect(result).toContain("Root Canvas");
    expect(result).toContain("Subpatch: amplifier");
    // Subpatch content should be indented
    expect(result).toMatch(/^\s{2}##/m);
  });

  it("formats complex patch with nested subpatch (reverb)", async () => {
    const result = await executeParsePatch(fixturePath("complex-patch.pd"));

    expect(result).toContain("Root Canvas");
    expect(result).toContain("Subpatch: reverb");
    // Root objects
    expect(result).toContain("loadbang");
    expect(result).toContain("metro 500");
    // Subpatch objects
    expect(result).toContain("delwrite~");
  });

  // -----------------------------------------------------------------------
  // No file path → no header with filename
  // -----------------------------------------------------------------------
  it("omits filename header when parsing raw text", async () => {
    const raw = "#N canvas 0 50 800 600 12;\n#X obj 50 50 osc~ 440;";
    const result = await executeParsePatch(raw);

    expect(result).not.toContain("# Patch:");
    expect(result).not.toContain("Path:");
    expect(result).toContain("Root Canvas");
  });
});
