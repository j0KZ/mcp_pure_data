# puredata-mcp

**MCP Server for Pure Data** — Parse, generate, analyze, and control Pd patches through AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-296%2F296-brightgreen)]()

---

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants deep understanding of [Pure Data](https://puredata.info/) patches. Instead of treating `.pd` files as opaque text, this server parses them into a structured AST, enabling Claude to:

- **Read** any `.pd` file and explain its signal flow in plain language
- **Generate** valid patches from natural language descriptions
- **Analyze** patches for broken connections, orphan objects, and complexity metrics
- **Template** 10 parameterized instruments (synth, sequencer, drums, reverb, etc.)
- **Rack** assemble multiple modules with inter-module wiring (Eurorack-style)

> *"Create a rack with clock, sequencer, synth with saw wave, reverb, and mixer — wire them together"* → complete `.pd` rack that opens in Pure Data

---

## Architecture

```
+-----------------------------------------------------+
|                   Claude / AI Client                 |
+------------------------+----------------------------+
                         | MCP (stdio)
+------------------------v----------------------------+
|              puredata-mcp-server                     |
|                                                      |
|  +-------------+  +--------------+  +------------+  |
|  | parse_patch  |  |generate_patch|  |  analyze / |  |
|  |              |  |              |  |  validate  |  |
|  +------+-------+  +------+------+  +-----+------+  |
|         |                 |               |          |
|  +------v-----------------v---------------v------+   |
|  |                  Core Engine                   |  |
|  |  +----------+  +------------+  +-----------+  |   |
|  |  |  Parser  |  | Serializer |  | Validator |  |   |
|  |  | .pd->AST |  |  AST->.pd  |  |  Checks   |  |   |
|  |  +----------+  +------------+  +-----------+  |   |
|  +-----------------------------------------------+   |
|                                                      |
|  +------------------------------------------------+  |
|  |         Template Engine (10 templates)          |  |
|  |  synth | seq | drums | reverb | mixer | clock   |  |
|  |  chaos | maths | turing-machine | granular      |  |
|  +------------------------+-----------------------+   |
|                           |                          |
|  +------------------------v-----------------------+  |
|  |              Rack Builder + Wiring             |  |
|  |  throw~/catch~ (audio) | send/receive (control)|  |
|  +------------------------------------------------+  |
|                                                      |
|  +------------------------------------------------+  |
|  |           Pd Object Registry                    |  |
|  |   ~100 vanilla objects - inlet/outlet metadata  |  |
|  +------------------------------------------------+  |
+------------------------------------------------------+
```

---

## Features

### Parser — Full AST from `.pd` files
Parses Pure Data's text-based format into a typed Abstract Syntax Tree with support for:
- Objects, messages, number boxes, symbol atoms, comments
- Nested subpatches (recursive canvas stack)
- All connection types (signal and control)
- Escaped semicolons, multi-line statements
- Round-trip fidelity (parse -> serialize -> parse = identical structure)

### Patch Generator — From JSON spec to valid `.pd`
```json
{
  "title": "Simple Sine",
  "nodes": [
    { "name": "osc~", "args": [440] },
    { "name": "*~", "args": [0.1] },
    { "name": "dac~" }
  ],
  "connections": [
    { "from": 0, "to": 1 },
    { "from": 1, "to": 2 },
    { "from": 1, "to": 2, "inlet": 1 }
  ]
}
```
Produces a `.pd` file that opens cleanly in Pure Data 0.54+.

### Object Registry
Categorized database of ~95 Pd-vanilla objects across math, MIDI, time, audio, control, data, GUI, and subpatch categories. Each entry includes inlet/outlet counts (with variable-count support for objects like `select`, `pack`, `trigger`), aliases, and signal type classification.

### Patch Validator — Structural integrity checks
Detects 9 categories of issues: broken connections, duplicate connections, unknown objects, orphan objects, empty subpatches, missing DSP sinks.

### Template Engine — 10 parameterized instruments

Modular two-tier system: **modules** (oscillator, filter, VCA, envelope, delay, reverb) compose into **templates** via `compose()` with automatic index offsetting.

| Template | Eurorack Analog | Key Parameters |
|----------|----------------|----------------|
| `synth` | Oscillator + Filter + VCA | `waveform`, `filter`, `envelope`, `frequency`, `cutoff`, `amplitude` |
| `sequencer` | Step sequencer | `steps`, `bpm`, `notes`, `midiChannel`, `velocity` |
| `drum-machine` | Analog drums | `voices` (bd/sn/hh/cp), `tune`, `decay`, `tone` |
| `reverb` | Spring/plate reverb | `variant` (schroeder/simple), `roomSize`, `damping`, `wetDry` |
| `mixer` | Mixer module | `channels` (1-16) |
| `clock` | Master clock | `bpm`, `divisions` (e.g. [1,2,4,8]) |
| `chaos` | Chaos/random CV | `outputs` (1-3), `speed`, `r` (logistic map parameter) |
| `maths` | Function generator | `channels` (1-2), `rise`, `fall`, `cycle`, `outputRange` |
| `turing-machine` | Turing Machine | `length`, `probability`, `range`, `offset` |
| `granular` | Granular sampler | `grains`, `grainSize`, `pitch`, `position`, `freeze`, `wetDry` |

### Rack Builder — Eurorack-style module assembly

Generates individual `.pd` files per module + a combined `_rack.pd` with all modules side-by-side.

**Inter-module wiring** connects modules via Pd bus objects:
- **Audio** (signal rate): `throw~` / `catch~`
- **Control** (message rate): `send` / `receive`

```json
{
  "modules": [
    { "template": "clock", "params": { "bpm": 140 }, "id": "clock" },
    { "template": "sequencer", "params": { "steps": 8 }, "id": "seq" },
    { "template": "synth", "params": { "waveform": "saw" }, "id": "synth" },
    { "template": "reverb", "id": "reverb" },
    { "template": "mixer", "params": { "channels": 2 }, "id": "mixer" }
  ],
  "wiring": [
    { "from": "clock", "output": "beat_div1", "to": "seq", "input": "clock_in" },
    { "from": "seq", "output": "note", "to": "synth", "input": "note" },
    { "from": "synth", "output": "audio", "to": "reverb", "input": "audio_in" },
    { "from": "reverb", "output": "audio", "to": "mixer", "input": "ch1" }
  ]
}
```

The wiring system handles connection redirection (no node removal), clock sync for self-clocking modules, audio fan-out, and table name deduplication.

### Patch Analyzer — Deep structural analysis
- **Object counts** by category (audio, control, MIDI, math, etc.)
- **Signal flow graph** — adjacency list with topological sort (Kahn's algorithm), cycle detection
- **DSP chain detection** — DFS from audio sources (`osc~`, `noise~`, `adc~`) to sinks (`dac~`, `writesf~`)
- **Complexity scoring** — 0-100 weighted score based on object count, connection density, subpatch depth, audio chains, and object variety

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/j0KZ/mcp_pure_data.git
cd mcp_pure_data
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "puredata-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_pure_data/dist/index.js"]
    }
  }
}
```

### 3. Use it

Open Claude Desktop and ask:

> *"Parse the file /path/to/my-patch.pd and explain what it does"*

> *"Create a rack with clock, sequencer, saw synth, reverb, and mixer — wire clock to sequencer, sequencer to synth, synth through reverb to mixer"*

---

## MCP Tools

### `parse_patch`
Parse a `.pd` file and return a structured description.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `generate_patch`
Generate a valid `.pd` file from a JSON specification.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `string?` | Comment at the top |
| `nodes` | `array` | Objects, messages, atoms |
| `connections` | `array` | Wiring between nodes |
| `outputPath` | `string?` | Write to file (optional) |

### `validate_patch`
Validate structural integrity (broken connections, orphans, missing sinks).

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `analyze_patch`
Object counts, signal flow graph, DSP chains, complexity score.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `create_from_template`
Generate a patch from a parameterized template (10 available).

| Parameter | Type | Description |
|-----------|------|-------------|
| `template` | `string` | Template name (see table above) |
| `params` | `object?` | Template-specific parameters |
| `outputPath` | `string?` | Write to file (optional) |

### `create_rack`
Assemble multiple modules into a rack with inter-module wiring.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modules` | `array` | Module specs: `{ template, params?, id?, filename? }` |
| `wiring` | `array?` | Connections: `{ from, output, to, input }` |
| `outputDir` | `string?` | Directory to write all files |

---

## Project Structure

```
src/
  index.ts                # MCP server — 6 tools, stdio transport
  types.ts                # PdPatch, PdCanvas, PdNode, PdConnection
  constants.ts            # Format constants, layout defaults
  core/
    parser.ts             # .pd text -> AST
    serializer.ts         # AST -> .pd text + buildPatch()
    object-registry.ts    # ~100 Pd-vanilla objects with port counts
    validator.ts          # 9 structural checks
  schemas/
    patch.ts              # Zod schemas for parse/generate
    analyze.ts            # Zod schemas for validate/analyze
    template.ts           # Zod schema for create_from_template
    rack.ts               # Zod schema for create_rack
  templates/
    index.ts              # Template registry + dispatcher
    port-info.ts          # PortInfo, RackableSpec types for wiring
    validate-params.ts    # Runtime param validation (all 10 templates)
    synth.ts              # Oscillator -> filter -> VCA -> dac~
    sequencer.ts          # MIDI step sequencer
    drum-machine.ts       # 4 analog drum voices (BD/SN/HH/CP)
    reverb-template.ts    # adc~ -> reverb -> wet/dry -> dac~
    mixer.ts              # N-channel mixer with inlet~
    clock.ts              # Master clock with divided outputs
    chaos.ts              # Logistic map chaos generator
    maths.ts              # Function generator (rise/fall envelopes)
    turing-machine.ts     # Shift register random sequencer
    granular.ts           # Granular synthesis sampler
    modules/
      types.ts            # ModuleResult, ModuleWire interfaces
      compose.ts          # Module composition with index offsetting
      oscillator.ts       # 4 variants: sine, saw, square, noise
      filter.ts           # 5 variants: lowpass, highpass, bandpass, moog, korg
      vca.ts              # VCA module (*~)
      envelope.ts         # 3 variants: adsr, ar, decay
      delay.ts            # 2 variants: simple, pingpong
      reverb.ts           # 2 variants: schroeder, simple
  wiring/
    bus-injector.ts       # Inter-module wiring (throw~/catch~, send/receive)
  tools/
    parse.ts              # parse_patch tool
    generate.ts           # generate_patch tool
    validate.ts           # validate_patch tool
    analyze.ts            # analyze_patch tool
    template.ts           # create_from_template tool
    rack.ts               # create_rack tool + combined patch builder
  utils/
    resolve-source.ts     # File-path vs raw-text resolver

tests/                       # 296 tests
  parser.test.ts             # 12 — parsing, subpatches, edge cases
  serializer.test.ts         # 8 — round-trip, spec builder, escaping
  object-registry.test.ts    # 37 — port counts, aliases, variable objects
  validator.test.ts          # 20 — each check type + fixtures
  analyze.test.ts            # 17 — counts, flow, DSP chains, complexity
  templates/
    compose.test.ts          # 5 — module composition, wiring
    modules.test.ts          # 17 — all module variants
    templates.test.ts        # 38 — complete template round-trips
    edge-cases.test.ts       # 99 — param validation, coercion, boundaries
  tools/
    rack.test.ts             # 13 — rack assembly, layout, file writing
    rack-wiring.test.ts      # 13 — wiring integration, bus injection
  wiring/
    bus-injector.test.ts     # 17 — connection helpers, validation
  fixtures/
    hello-world.pd           # Minimal: osc~ -> *~ -> dac~
    midi-sequencer.pd        # 4-step sequencer with noteout
    subpatch.pd              # Nested canvas with inlet~/outlet~
    broken-connections.pd    # Invalid connections for validator
    orphan-objects.pd        # Disconnected objects
    complex-patch.pd         # Multi-chain audio + control + subpatch
```

---

## Development

```bash
npm run build        # Compile with tsup (ESM + declarations)
npm run dev          # Watch mode
npm run test         # Run vitest (296 tests)
npm run lint         # Type-check with tsc --noEmit
npm run inspect      # Test server with MCP Inspector
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** (strict mode) | Type-safe parser and serializer |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | Protocol implementation |
| **Zod** | Runtime input validation |
| **Vitest** | Test runner |
| **tsup** | Bundler (ESM output) |

---

## Roadmap

- [x] **Phase 1**: Core parser + serializer + MCP scaffold
- [x] **Phase 2**: Patch analysis + validation (object registry, signal flow, DSP chains, complexity)
- [x] **Phase 3**: Template engine — 10 parameterized instruments with modular topology
- [x] **Phase 4**: `create_from_template` tool + `create_rack` (multi-module assembly)
- [x] **Phase 5**: Inter-module wiring (throw~/catch~, send/receive, clock sync)
- [ ] **Phase 6**: MIDI hardware integration (MicroFreak, TR-8S, K2 controller)
- [ ] **Phase 7**: VCV Rack Prototype bridge (libpd export)
- [ ] **Phase 8**: Live control via OSC/FUDI (send messages to running Pd)

---

## License

MIT
