import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parsePatch } from "../src/core/parser.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("parsePatch", () => {
  describe("hello-world.pd", () => {
    it("should parse root canvas", () => {
      const patch = parsePatch(loadFixture("hello-world.pd"));
      expect(patch.root).toBeDefined();
      expect(patch.root.isSubpatch).toBe(false);
      expect(patch.root.width).toBe(800);
      expect(patch.root.height).toBe(600);
      expect(patch.root.fontSize).toBe(12);
    });

    it("should parse all objects", () => {
      const patch = parsePatch(loadFixture("hello-world.pd"));
      const nodes = patch.root.nodes;
      expect(nodes).toHaveLength(3);

      expect(nodes[0].name).toBe("osc~");
      expect(nodes[0].args).toEqual([440]);

      expect(nodes[1].name).toBe("*~");
      expect(nodes[1].args).toEqual([0.1]);

      expect(nodes[2].name).toBe("dac~");
    });

    it("should parse all connections", () => {
      const patch = parsePatch(loadFixture("hello-world.pd"));
      const conns = patch.root.connections;
      expect(conns).toHaveLength(3);

      // osc~ -> *~
      expect(conns[0]).toEqual({ fromNode: 0, fromOutlet: 0, toNode: 1, toInlet: 0 });
      // *~ -> dac~ left
      expect(conns[1]).toEqual({ fromNode: 1, fromOutlet: 0, toNode: 2, toInlet: 0 });
      // *~ -> dac~ right
      expect(conns[2]).toEqual({ fromNode: 1, fromOutlet: 0, toNode: 2, toInlet: 1 });
    });
  });

  describe("midi-sequencer.pd", () => {
    it("should parse all nodes including text and msg", () => {
      const patch = parsePatch(loadFixture("midi-sequencer.pd"));
      const nodes = patch.root.nodes;

      // text + loadbang + msg(1) + metro + float + + + mod + select + 4 msgs + pack + noteout = 14
      expect(nodes.length).toBe(14);

      // First node is a comment
      expect(nodes[0].type).toBe("text");

      // loadbang
      expect(nodes[1].name).toBe("loadbang");

      // msg "1"
      expect(nodes[2].type).toBe("msg");
      expect(nodes[2].args).toEqual([1]);

      // metro 500
      expect(nodes[3].name).toBe("metro");
      expect(nodes[3].args).toEqual([500]);
    });

    it("should parse all connections", () => {
      const patch = parsePatch(loadFixture("midi-sequencer.pd"));
      expect(patch.root.connections.length).toBe(16);
    });
  });

  describe("subpatch.pd", () => {
    it("should parse subpatch as child canvas", () => {
      const patch = parsePatch(loadFixture("subpatch.pd"));

      // Root should have subpatches
      expect(patch.root.subpatches).toHaveLength(1);
      expect(patch.root.subpatches[0].name).toBe("amplifier");
      expect(patch.root.subpatches[0].isSubpatch).toBe(true);
    });

    it("should parse subpatch internal nodes", () => {
      const patch = parsePatch(loadFixture("subpatch.pd"));
      const sub = patch.root.subpatches[0];

      expect(sub.nodes).toHaveLength(3);
      expect(sub.nodes[0].name).toBe("inlet~");
      expect(sub.nodes[1].name).toBe("*~");
      expect(sub.nodes[2].name).toBe("outlet~");
    });

    it("should parse subpatch connections", () => {
      const patch = parsePatch(loadFixture("subpatch.pd"));
      const sub = patch.root.subpatches[0];
      expect(sub.connections).toHaveLength(2);
    });

    it("should create a pd node in the parent canvas for the subpatch", () => {
      const patch = parsePatch(loadFixture("subpatch.pd"));
      // Root nodes: osc~, pd amplifier, dac~
      expect(patch.root.nodes).toHaveLength(3);
      expect(patch.root.nodes[1].name).toBe("pd");
      expect(patch.root.nodes[1].args).toEqual(["amplifier"]);
    });
  });

  describe("raw text parsing", () => {
    it("should parse inline .pd text", () => {
      const text = `#N canvas 0 0 400 300 10;
#X obj 10 10 bang;
#X obj 10 50 print;
#X connect 0 0 1 0;`;
      const patch = parsePatch(text);
      expect(patch.root.nodes).toHaveLength(2);
      expect(patch.root.connections).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("should throw on empty input", () => {
      expect(() => parsePatch("")).toThrow("no root canvas");
    });

    it("should handle escaped semicolons", () => {
      const text = `#N canvas 0 0 400 300 10;
#X msg 10 10 set \\; clear;`;
      const patch = parsePatch(text);
      expect(patch.root.nodes).toHaveLength(1);
      expect(patch.root.nodes[0].type).toBe("msg");
    });
  });
});
