import { describe, it, expect } from "vitest";
import {
  applyWiring,
  removeConnectionsTo,
  removeConnectionsBetween,
  redirectConnectionsFrom,
  type WiringModule,
  type WireSpec,
} from "../../src/wiring/bus-injector.js";
import type { PatchNodeSpec, PatchConnectionSpec } from "../../src/core/serializer.js";
import { buildTemplateWithPorts } from "../../src/templates/index.js";

// ─── Helper to build minimal wiring-ready module data ─────────────────

function buildModule(template: string, params = {}) {
  const r = buildTemplateWithPorts(template, params);
  return { spec: r.spec, ports: r.ports };
}

// ─── Connection helper unit tests ─────────────────────────────────────

describe("connection helpers", () => {
  it("removeConnectionsTo removes only TO connections", () => {
    const conns: PatchConnectionSpec[] = [
      { from: 0, outlet: 0, to: 1, inlet: 0 },
      { from: 1, outlet: 0, to: 2, inlet: 0 },
      { from: 3, outlet: 0, to: 1, inlet: 1 },
    ];
    removeConnectionsTo(conns, 1);
    // Only connections TO node 1 should be removed (first and third)
    expect(conns).toHaveLength(1);
    expect(conns[0]).toEqual({ from: 1, outlet: 0, to: 2, inlet: 0 });
  });

  it("removeConnectionsBetween removes specific from→to pair", () => {
    const conns: PatchConnectionSpec[] = [
      { from: 0, outlet: 0, to: 1, inlet: 0 },
      { from: 0, outlet: 0, to: 2, inlet: 0 },
      { from: 1, outlet: 0, to: 2, inlet: 0 },
    ];
    removeConnectionsBetween(conns, 0, 1);
    expect(conns).toHaveLength(2);
    expect(conns[0]).toEqual({ from: 0, outlet: 0, to: 2, inlet: 0 });
    expect(conns[1]).toEqual({ from: 1, outlet: 0, to: 2, inlet: 0 });
  });

  it("redirectConnectionsFrom changes from field", () => {
    const conns: PatchConnectionSpec[] = [
      { from: 5, outlet: 0, to: 6, inlet: 0 },
      { from: 5, outlet: 0, to: 7, inlet: 1 },
      { from: 8, outlet: 0, to: 9, inlet: 0 },
    ];
    redirectConnectionsFrom(conns, 5, 99);
    expect(conns[0].from).toBe(99);
    expect(conns[1].from).toBe(99);
    expect(conns[2].from).toBe(8); // unaffected
  });
});

// ─── applyWiring tests ────────────────────────────────────────────────

describe("applyWiring", () => {
  it("does nothing when wiring is empty", () => {
    const nodes: PatchNodeSpec[] = [{ type: "text", args: ["test"] }];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [];
    applyWiring(nodes, conns, modules, []);
    expect(nodes).toHaveLength(1);
    expect(conns).toHaveLength(0);
  });

  it("creates audio bus: synth audio → reverb audio_in", () => {
    const synth = buildModule("synth", { waveform: "saw" });
    const rev = buildModule("reverb");

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    // Simulate layout: synth at offset 0, reverb at offset after synth
    const synthOffset = 0;
    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from + synthOffset, outlet: c.outlet ?? 0, to: c.to + synthOffset, inlet: c.inlet ?? 0 });
    }

    const revOffset = synth.spec.nodes.length;
    for (const n of rev.spec.nodes) allNodes.push(n);
    for (const c of rev.spec.connections) {
      allConns.push({ from: c.from + revOffset, outlet: c.outlet ?? 0, to: c.to + revOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: synthOffset },
      { id: "reverb", ports: rev.ports, nodeOffset: revOffset },
    ];

    const initialNodeCount = allNodes.length;
    const wiring: WireSpec[] = [
      { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
    ];

    applyWiring(allNodes, allConns, modules, wiring);

    // Should have added throw~ and catch~ nodes
    expect(allNodes.length).toBe(initialNodeCount + 2);
    const throwNode = allNodes[initialNodeCount];
    const catchNode = allNodes[initialNodeCount + 1];
    expect(throwNode.name).toBe("throw~");
    expect(throwNode.args![0]).toBe("synth__audio");
    expect(catchNode.name).toBe("catch~");
    expect(catchNode.args![0]).toBe("synth__audio");
  });

  it("creates control bus: sequencer note → synth note", () => {
    const seq = buildModule("sequencer", { steps: 4 });
    const synth = buildModule("synth");

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of seq.spec.nodes) allNodes.push(n);
    for (const c of seq.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const synthOffset = seq.spec.nodes.length;
    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from + synthOffset, outlet: c.outlet ?? 0, to: c.to + synthOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "seq", ports: seq.ports, nodeOffset: 0 },
      { id: "synth", ports: synth.ports, nodeOffset: synthOffset },
    ];

    const wiring: WireSpec[] = [
      { from: "seq", output: "note", to: "synth", input: "note" },
    ];

    const initialNodeCount = allNodes.length;
    applyWiring(allNodes, allConns, modules, wiring);

    // Should have added send and receive nodes
    expect(allNodes.length).toBe(initialNodeCount + 2);
    expect(allNodes[initialNodeCount].name).toBe("send");
    expect(allNodes[initialNodeCount].args![0]).toBe("seq__note");
    expect(allNodes[initialNodeCount + 1].name).toBe("receive");
    expect(allNodes[initialNodeCount + 1].args![0]).toBe("seq__note");
  });

  it("handles clock sync: clock → sequencer clock_in", () => {
    const clock = buildModule("clock", { bpm: 120, divisions: [1] });
    const seq = buildModule("sequencer", { steps: 4 });

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of clock.spec.nodes) allNodes.push(n);
    for (const c of clock.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const seqOffset = clock.spec.nodes.length;
    for (const n of seq.spec.nodes) allNodes.push(n);
    for (const c of seq.spec.connections) {
      allConns.push({ from: c.from + seqOffset, outlet: c.outlet ?? 0, to: c.to + seqOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "clock", ports: clock.ports, nodeOffset: 0 },
      { id: "seq", ports: seq.ports, nodeOffset: seqOffset },
    ];

    // Sequencer clock_in: nodeIndex=4 (float), ioNodeIndex=3 (metro)
    // The metro→float connection should be removed, and receive→float added
    const metroAbsolute = 3 + seqOffset;
    const floatAbsolute = 4 + seqOffset;

    // Verify metro→float connection exists before wiring
    const metroConn = allConns.find(
      (c) => c.from === metroAbsolute && c.to === floatAbsolute,
    );
    expect(metroConn).toBeDefined();

    applyWiring(allNodes, allConns, modules, [
      { from: "clock", output: "beat_div1", to: "seq", input: "clock_in" },
    ]);

    // metro→float connection should be removed
    const metroConnAfter = allConns.find(
      (c) => c.from === metroAbsolute && c.to === floatAbsolute,
    );
    expect(metroConnAfter).toBeUndefined();

    // Should have a receive → float connection
    const receiveIdx = allNodes.length - 1; // last added node
    expect(allNodes[receiveIdx].name).toBe("receive");
    const receiveConn = allConns.find((c) => c.from === receiveIdx && c.to === floatAbsolute);
    expect(receiveConn).toBeDefined();
  });

  it("handles mixer inlet~ redirect: catch~ replaces inlet~ as signal source", () => {
    const synth = buildModule("synth");
    const mixer = buildModule("mixer", { channels: 2 });

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const mixerOffset = synth.spec.nodes.length;
    for (const n of mixer.spec.nodes) allNodes.push(n);
    for (const c of mixer.spec.connections) {
      allConns.push({ from: c.from + mixerOffset, outlet: c.outlet ?? 0, to: c.to + mixerOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: 0 },
      { id: "mixer", ports: mixer.ports, nodeOffset: mixerOffset },
    ];

    // Mixer ch1: nodeIndex=inlet~=1, ioNodeIndex=inlet~=1
    const inletAbsolute = mixer.ports.find((p) => p.name === "ch1")!.nodeIndex + mixerOffset;

    // Check inlet~ has outgoing connections before wiring
    const inletConns = allConns.filter((c) => c.from === inletAbsolute);
    expect(inletConns.length).toBeGreaterThan(0);

    applyWiring(allNodes, allConns, modules, [
      { from: "synth", output: "audio", to: "mixer", input: "ch1" },
    ]);

    // catch~ should have replaced inlet~ as the source in those connections
    const catchIdx = allNodes.length - 1;
    expect(allNodes[catchIdx].name).toBe("catch~");
    const redirectedConns = allConns.filter((c) => c.from === catchIdx);
    expect(redirectedConns.length).toBeGreaterThan(0);
  });

  it("handles reverb adc~ multi-target redirect", () => {
    const synth = buildModule("synth");
    const rev = buildModule("reverb");

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const revOffset = synth.spec.nodes.length;
    for (const n of rev.spec.nodes) allNodes.push(n);
    for (const c of rev.spec.connections) {
      allConns.push({ from: c.from + revOffset, outlet: c.outlet ?? 0, to: c.to + revOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: 0 },
      { id: "reverb", ports: rev.ports, nodeOffset: revOffset },
    ];

    // Reverb adc~ (ioNodeIndex=1) feeds multiple targets (dry path + reverb inlets)
    const adcAbsolute = 1 + revOffset;
    const adcConnsBefore = allConns.filter((c) => c.from === adcAbsolute);
    expect(adcConnsBefore.length).toBeGreaterThanOrEqual(2); // dry + at least 1 reverb inlet

    applyWiring(allNodes, allConns, modules, [
      { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
    ]);

    // All connections that were FROM adc~ should now be FROM catch~
    const catchIdx = allNodes.findIndex((n) => n.name === "catch~");
    expect(catchIdx).toBeGreaterThan(-1);

    const adcConnsAfter = allConns.filter((c) => c.from === adcAbsolute);
    expect(adcConnsAfter.length).toBe(0); // all redirected

    const catchConnsAfter = allConns.filter((c) => c.from === catchIdx);
    expect(catchConnsAfter.length).toBe(adcConnsBefore.length); // same count, different source
  });

  it("unwired modules keep their dac~ intact", () => {
    const synth = buildModule("synth");
    const drums = buildModule("drum-machine");
    const mixer = buildModule("mixer", { channels: 2 });

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const drumsOffset = synth.spec.nodes.length;
    for (const n of drums.spec.nodes) allNodes.push(n);
    for (const c of drums.spec.connections) {
      allConns.push({ from: c.from + drumsOffset, outlet: c.outlet ?? 0, to: c.to + drumsOffset, inlet: c.inlet ?? 0 });
    }

    const mixerOffset = drumsOffset + drums.spec.nodes.length;
    for (const n of mixer.spec.nodes) allNodes.push(n);
    for (const c of mixer.spec.connections) {
      allConns.push({ from: c.from + mixerOffset, outlet: c.outlet ?? 0, to: c.to + mixerOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: 0 },
      { id: "drums", ports: drums.ports, nodeOffset: drumsOffset },
      { id: "mixer", ports: mixer.ports, nodeOffset: mixerOffset },
    ];

    // Wire only synth → mixer (drums stays unwired)
    const drumsDacPort = drums.ports.find((p) => p.name === "audio");
    const drumsDacIdx = drumsDacPort!.ioNodeIndex! + drumsOffset;
    const drumsDacConnsBefore = allConns.filter((c) => c.to === drumsDacIdx);
    expect(drumsDacConnsBefore.length).toBeGreaterThan(0);

    applyWiring(allNodes, allConns, modules, [
      { from: "synth", output: "audio", to: "mixer", input: "ch1" },
    ]);

    // Drums dac~ connections should still be intact (not wired)
    const drumsDacConnsAfter = allConns.filter((c) => c.to === drumsDacIdx);
    expect(drumsDacConnsAfter.length).toBe(drumsDacConnsBefore.length);
  });

  it("audio fan-out: same source → 2 destinations shares catch~", () => {
    const synth = buildModule("synth");
    const mixer = buildModule("mixer", { channels: 2 });
    const rev = buildModule("reverb");

    const allNodes: PatchNodeSpec[] = [];
    const allConns: PatchConnectionSpec[] = [];

    for (const n of synth.spec.nodes) allNodes.push(n);
    for (const c of synth.spec.connections) {
      allConns.push({ from: c.from, outlet: c.outlet ?? 0, to: c.to, inlet: c.inlet ?? 0 });
    }

    const mixerOffset = synth.spec.nodes.length;
    for (const n of mixer.spec.nodes) allNodes.push(n);
    for (const c of mixer.spec.connections) {
      allConns.push({ from: c.from + mixerOffset, outlet: c.outlet ?? 0, to: c.to + mixerOffset, inlet: c.inlet ?? 0 });
    }

    const revOffset = mixerOffset + mixer.spec.nodes.length;
    for (const n of rev.spec.nodes) allNodes.push(n);
    for (const c of rev.spec.connections) {
      allConns.push({ from: c.from + revOffset, outlet: c.outlet ?? 0, to: c.to + revOffset, inlet: c.inlet ?? 0 });
    }

    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: 0 },
      { id: "mixer", ports: mixer.ports, nodeOffset: mixerOffset },
      { id: "reverb", ports: rev.ports, nodeOffset: revOffset },
    ];

    applyWiring(allNodes, allConns, modules, [
      { from: "synth", output: "audio", to: "mixer", input: "ch1" },
      { from: "synth", output: "audio", to: "reverb", input: "audio_in" },
    ]);

    // Should have exactly ONE throw~ and ONE catch~ with the same bus name
    const throwNodes = allNodes.filter((n) => n.name === "throw~" && n.args?.[0] === "synth__audio");
    const catchNodes = allNodes.filter((n) => n.name === "catch~" && n.args?.[0] === "synth__audio");
    expect(throwNodes).toHaveLength(1);
    expect(catchNodes).toHaveLength(1);
  });
});

// ─── Validation tests ────────────────────────────────────────────────

describe("applyWiring validation", () => {
  it("throws on invalid module ID", () => {
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "synth", ports: [], nodeOffset: 0 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "nonexistent", output: "audio", to: "synth", input: "note" },
      ]),
    ).toThrow(/source module "nonexistent" not found/);
  });

  it("throws on invalid port name with available ports listed", () => {
    const synth = buildModule("synth");
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "synth", ports: synth.ports, nodeOffset: 0 },
      { id: "mixer", ports: [{ name: "ch1", type: "audio", direction: "input", nodeIndex: 0, port: 0 }], nodeOffset: 100 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "synth", output: "nonexistent", to: "mixer", input: "ch1" },
      ]),
    ).toThrow(/output port "nonexistent" not found.*Available outputs/);
  });

  it("throws on duplicate input port", () => {
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "a", ports: [{ name: "out", type: "control", direction: "output", nodeIndex: 0, port: 0 }], nodeOffset: 0 },
      { id: "b", ports: [{ name: "out", type: "control", direction: "output", nodeIndex: 0, port: 0 }], nodeOffset: 10 },
      { id: "c", ports: [{ name: "in", type: "control", direction: "input", nodeIndex: 0, port: 0 }], nodeOffset: 20 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "a", output: "out", to: "c", input: "in" },
        { from: "b", output: "out", to: "c", input: "in" },
      ]),
    ).toThrow(/duplicate input.*c\.in/i);
  });

  it("throws on type mismatch (audio → control)", () => {
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "a", ports: [{ name: "audio", type: "audio", direction: "output", nodeIndex: 0, port: 0 }], nodeOffset: 0 },
      { id: "b", ports: [{ name: "note", type: "control", direction: "input", nodeIndex: 0, port: 0 }], nodeOffset: 10 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "a", output: "audio", to: "b", input: "note" },
      ]),
    ).toThrow(/type mismatch.*audio.*control/);
  });

  it("throws on duplicate module ID", () => {
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "x", ports: [], nodeOffset: 0 },
      { id: "x", ports: [], nodeOffset: 10 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "x", output: "a", to: "x", input: "b" },
      ]),
    ).toThrow(/Duplicate module ID "x"/);
  });

  it("throws on self-wiring", () => {
    const nodes: PatchNodeSpec[] = [];
    const conns: PatchConnectionSpec[] = [];
    const modules: WiringModule[] = [
      { id: "a", ports: [
        { name: "out", type: "control", direction: "output", nodeIndex: 0, port: 0 },
        { name: "in", type: "control", direction: "input", nodeIndex: 1, port: 0 },
      ], nodeOffset: 0 },
    ];
    expect(() =>
      applyWiring(nodes, conns, modules, [
        { from: "a", output: "out", to: "a", input: "in" },
      ]),
    ).toThrow(/cannot be wired to itself/);
  });
});
