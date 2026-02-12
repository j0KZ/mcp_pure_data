import { describe, it, expect } from "vitest";
import { compose } from "../../src/templates/modules/compose.js";
import type { ModuleResult, ModuleWire } from "../../src/templates/modules/types.js";
import { buildPatch } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";

/** Helper: create a minimal module with N nodes. */
function fakeModule(nodeCount: number, inlets: number[] = [0], outlets?: number[]): ModuleResult {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    type: "obj" as const,
    name: `fake${i}`,
  }));
  return {
    nodes,
    connections: nodeCount > 1 ? [{ from: 0, to: 1 }] : [],
    inlets,
    outlets: outlets ?? [nodeCount - 1],
  };
}

describe("compose()", () => {
  it("offsets module indices correctly", () => {
    const modA = fakeModule(2); // nodes 0-1
    const modB = fakeModule(3); // nodes 0-2

    const spec = compose("Test", [modA, modB], []);

    // Title adds 1 node at index 0
    // modA nodes at indices 1-2, modB nodes at indices 3-5
    expect(spec.nodes.length).toBe(1 + 2 + 3); // title + modA + modB = 6

    // modA internal connection: was 0→1, now 1→2
    const modAConn = spec.connections.find(
      (c) => c.from === 1 && c.to === 2,
    );
    expect(modAConn).toBeDefined();

    // modB internal connection: was 0→1, now 3→4
    const modBConn = spec.connections.find(
      (c) => c.from === 3 && c.to === 4,
    );
    expect(modBConn).toBeDefined();
  });

  it("wires modules together via ModuleWire", () => {
    const modA = fakeModule(1, [0], [0]); // outlet: node 0
    const modB = fakeModule(1, [0], [0]); // inlet: node 0

    const wiring: ModuleWire[] = [
      { from: { module: 0, outlet: 0 }, to: { module: 1, inlet: 0 } },
    ];

    const spec = compose("Test", [modA, modB], wiring);

    // Title at 0, modA at 1, modB at 2
    // Wire: modA outlet[0] (node 0) + offset 1 = 1 → modB inlet[0] (node 0) + offset 2 = 2
    const wire = spec.connections.find(
      (c) => c.from === 1 && c.to === 2,
    );
    expect(wire).toBeDefined();
  });

  it("returns title: undefined to prevent buildPatch double-offset", () => {
    const mod = fakeModule(1);
    const spec = compose("My Title", [mod], []);

    expect(spec.title).toBeUndefined();
    // Title is in nodes[0] as text type
    expect(spec.nodes[0].type).toBe("text");
    expect(spec.nodes[0].args).toEqual(["My Title"]);
  });

  it("round-trips through buildPatch → parsePatch without errors", () => {
    const modA = fakeModule(2, [0], [1]);
    const modB = fakeModule(1, [0], [0]);
    const wiring: ModuleWire[] = [
      { from: { module: 0, outlet: 0 }, to: { module: 1, inlet: 0 } },
    ];

    const spec = compose("Round-trip Test", [modA, modB], wiring);
    const pdText = buildPatch(spec);
    const parsed = parsePatch(pdText);

    // Should have title comment + 3 obj nodes = 4 total
    expect(parsed.root.nodes.length).toBe(4);
    // Connections: 1 internal (modA) + 1 wire = 2
    expect(parsed.root.connections.length).toBe(2);
  });

  it("handles empty title (no offset)", () => {
    const mod = fakeModule(2);
    const spec = compose("", [mod], []);

    expect(spec.nodes.length).toBe(2); // no title node
    // Internal connection: was 0→1, stays 0→1
    const conn = spec.connections.find((c) => c.from === 0 && c.to === 1);
    expect(conn).toBeDefined();
  });
});
