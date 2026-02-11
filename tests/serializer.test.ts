import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parsePatch } from "../src/core/parser.js";
import { serializePatch, buildPatch } from "../src/core/serializer.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("serializePatch", () => {
  describe("round-trip: parse → serialize → parse", () => {
    const fixtures = ["hello-world.pd", "midi-sequencer.pd", "subpatch.pd"];

    for (const fixture of fixtures) {
      it(`should round-trip ${fixture}`, () => {
        const original = loadFixture(fixture);
        const ast1 = parsePatch(original);
        const serialized = serializePatch(ast1);
        const ast2 = parsePatch(serialized);

        // Compare structurally (not string equality — whitespace may differ)
        expect(ast2.root.nodes.length).toBe(ast1.root.nodes.length);
        expect(ast2.root.connections.length).toBe(ast1.root.connections.length);
        expect(ast2.root.subpatches.length).toBe(ast1.root.subpatches.length);

        // Node names must match
        for (let i = 0; i < ast1.root.nodes.length; i++) {
          expect(ast2.root.nodes[i].name).toBe(ast1.root.nodes[i].name);
          expect(ast2.root.nodes[i].type).toBe(ast1.root.nodes[i].type);
        }

        // Connections must match
        for (let i = 0; i < ast1.root.connections.length; i++) {
          expect(ast2.root.connections[i]).toEqual(ast1.root.connections[i]);
        }

        // Subpatch structure must match
        for (let i = 0; i < ast1.root.subpatches.length; i++) {
          const sub1 = ast1.root.subpatches[i];
          const sub2 = ast2.root.subpatches[i];
          expect(sub2.name).toBe(sub1.name);
          expect(sub2.nodes.length).toBe(sub1.nodes.length);
          expect(sub2.connections.length).toBe(sub1.connections.length);
        }
      });
    }
  });
});

describe("buildPatch", () => {
  it("should generate a valid .pd file from a spec", () => {
    const pdText = buildPatch({
      title: "Test Patch",
      nodes: [
        { name: "osc~", args: [440] },
        { name: "*~", args: [0.1] },
        { name: "dac~" },
      ],
      connections: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 1, to: 2, inlet: 1 },
      ],
    });

    // Should be valid Pd text
    expect(pdText).toContain("#N canvas");
    expect(pdText).toContain("osc~ 440");
    expect(pdText).toContain("*~ 0.1");
    expect(pdText).toContain("dac~");
    expect(pdText).toContain("#X connect");
    expect(pdText).toContain("Test Patch");

    // Should be parseable
    const patch = parsePatch(pdText);
    // title comment + 3 objects = 4 nodes
    expect(patch.root.nodes.length).toBe(4);
    expect(patch.root.connections.length).toBe(3);
  });

  it("should auto-layout nodes vertically", () => {
    const pdText = buildPatch({
      nodes: [
        { name: "bang" },
        { name: "print" },
      ],
      connections: [{ from: 0, to: 1 }],
    });

    const patch = parsePatch(pdText);
    // Second node should be below the first
    expect(patch.root.nodes[1].y).toBeGreaterThan(patch.root.nodes[0].y);
  });
});
