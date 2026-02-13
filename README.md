# synthlab-mcp

**AI-powered synthesis lab** — Compose songs, generate Pure Data & VCV Rack patches, map MIDI controllers, and control live synths through Claude.

[![CI](https://github.com/j0KZ/synthlab-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/j0KZ/synthlab-mcp-server/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/synthlab-mcp-server)](https://www.npmjs.com/package/synthlab-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that turns Claude into a full synthesis workstation. 10 tools + 1 prompt, 619 tests, zero runtime dependencies beyond MCP SDK + Zod.

**Pure Data** — compose full songs from genre descriptions, parse `.pd` files into typed ASTs, generate patches from specs, analyze signal flow, template 11 instruments, assemble multi-module racks with inter-module wiring, send OSC/FUDI in real time.

**VCV Rack** — generate `.vcv` patch files from module + cable specs, with a registry of 15 plugins (~400 modules) auto-scraped from C++ source.

**MIDI Controllers** — auto-map hardware controls (Korg nanoKONTROL2, Arturia MicroFreak, Roland TR-8S) to rack parameters with absolute, relative, and trigger modes.

> *"Compose a dark techno track with drums, bass, and an arpeggio — use K2 controller"* → complete `.pd` rack with clock, sequencer, synths, mixer, reverb, and MIDI mapping

> *"Create a rack with clock, sequencer, saw synth, reverb, and mixer — wire them together"* → individual `.pd` files + combined rack that opens in Pure Data

> *"Create a VCV Rack patch with VCO → VCF → VCA → AudioInterface2"* → `.vcv` file that loads in VCV Rack 2.x

---

## Architecture

```
+--------------------------------------------------------------------+
|                       Claude / AI Client                           |
+----------------------------+---------------------------------------+
                             | MCP (stdio)
+----------------------------v---------------------------------------+
|                      synthlab-mcp-server                             |
|                                                                    |
|  10 MCP Tools + 1 Prompt                                           |
|  +------------------+  +------------------+  +------------------+  |
|  |   parse_patch    |  |  generate_patch  |  |  analyze_patch   |  |
|  |  validate_patch  |  | create_template  |  |   create_rack    |  |
|  |  send_message    |  | list_vcv_modules |  |   generate_vcv   |  |
|  |  compose_patch   |  |                  |  |                  |  |
|  +--------+---------+  +--------+---------+  +--------+---------+  |
|           |                     |                      |           |
|  +--------v---------------------v----------------------v---------+ |
|  |                       Pd Core Engine                          | |
|  |  Parser (.pd→AST) | Serializer (AST→.pd) | Validator         | |
|  |  Object Registry (~100 Pd-vanilla objects)                    | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |            Template Engine (11 templates)                     | |
|  |  synth | seq | drums | reverb | mixer | clock | bridge        | |
|  |  chaos | maths | turing-machine | granular                    | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |     Rack Builder + Wiring + MIDI Controllers                  | |
|  |  throw~/catch~ (audio) | send/receive (control)               | |
|  |  K2 (abs+rel+trigger) | MicroFreak (output) | TR-8S (bidir)  | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |     Song Composer (genre → wired rack)                        | |
|  |  9 genres | 7 moods | 8 roles | 10 scales | auto-wiring      | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |            VCV Rack Generator                                 | |
|  |  15-plugin registry (~400 modules) from C++ source scraping   | |
|  |  Fuzzy port/param resolution | HP positioning | Cable wiring  | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +---------------------------------------------------------------+ |
|  |            Network Layer (zero external deps)                 | |
|  |  OSC encoder (binary) | FUDI formatter (text)                 | |
|  |  UDP sender (dgram) | TCP sender (net)                        | |
|  +---------------------------------------------------------------+ |
+--------------------------------------------------------------------+
              |                                 |
    OSC (UDP) / FUDI (TCP)               .vcv file output
              |                                 |
      +-------v-------+               +--------v--------+
      |  Pure Data    |               |  VCV Rack 2.x   |
      |  (running)    |               |                  |
      +---------------+               +-----------------+
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

### Template Engine — 11 parameterized instruments

Modular two-tier system: **modules** (oscillator, filter, VCA, envelope, delay, reverb) compose into **templates** via `compose()` with automatic index offsetting.

| Template | Eurorack Analog | Key Parameters |
|----------|----------------|----------------|
| `synth` | Oscillator + Filter + VCA | `waveform`, `filter`, `envelope`, `frequency`, `cutoff`, `amplitude` |
| `sequencer` | Step sequencer | `steps`, `bpm`, `notes`, `midiChannel`, `velocity` |
| `drum-machine` | Analog drums (3-layer) | `voices` (bd/sn/hh/cp), `tune`, `decay`, `tone`, per-voice volume |
| `reverb` | Spring/plate reverb | `variant` (schroeder/simple), `roomSize`, `damping`, `wetDry` |
| `mixer` | Mixer module | `channels` (1-16), per-channel mute gates |
| `clock` | Master clock | `bpm`, `divisions` (e.g. [1,2,4,8]) |
| `chaos` | Chaos/random CV | `outputs` (1-3), `speed`, `r` (logistic map parameter) |
| `maths` | Function generator | `channels` (1-2), `rise`, `fall`, `cycle`, `outputRange` |
| `turing-machine` | Turing Machine | `length`, `probability`, `range`, `offset` |
| `granular` | Granular sampler | `grains`, `grainSize`, `pitch`, `position`, `freeze`, `wetDry` |
| `bridge` | Network receiver | `protocol` (osc/fudi), `port`, `routes` |

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

### MIDI Controller System — Hardware integration

Auto-maps hardware controls to rack parameters. Generates `_controller.pd` (MIDI routing) and `_k2_config.json` (LED feedback).

**Three device profiles:**

| Device | Controls | Direction | Features |
|--------|----------|-----------|----------|
| **Korg nanoKONTROL2** | 34 (faders, pots, buttons) | Input | Absolute, relative (encoders), trigger/toggle |
| **Arturia MicroFreak** | 21 parameters | Output only | CC output for display sync |
| **Roland TR-8S** | 51 parameters | Bidirectional | Send + receive, LED feedback |

**Auto-mapper phases:**
1. Custom mappings (user-specified)
2. Amplitude controls → faders
3. Frequency/filter controls → pots
4. Remaining controls → relative encoders
5. Transport/toggle controls → buttons

```json
{
  "modules": [
    { "template": "synth", "params": { "waveform": "saw" }, "id": "synth" },
    { "template": "mixer", "id": "mixer" }
  ],
  "controller": {
    "device": "k2",
    "mappings": [
      { "control": "fader_0", "module": "synth", "parameter": "amplitude" }
    ]
  }
}
```

### Song Composer — Genre-driven rack generation

High-level creative interface: describe a song by genre, mood, tempo, key, and instruments — get a complete wired Pd rack with MIDI controller integration.

**9 genres** with curated presets:

| Genre | Default Tempo | Default Mood | Default Instruments |
|-------|--------------|-------------|---------------------|
| `ambient` | 70 | ethereal | pad, texture |
| `techno` | 130 | dark | drums, bass, lead |
| `house` | 124 | energetic | drums, bass, pad |
| `dnb` | 174 | aggressive | drums, bass, lead |
| `experimental` | 100 | dark | modulator, texture, sequence |
| `idm` | 140 | ethereal | drums, arpeggio, modulator |
| `minimal` | 125 | chill | drums, bass |
| `drone` | 40 | melancholic | pad, pad |
| `noise` | 120 | aggressive | texture, modulator, drums |

**7 moods** adjust synthesis parameters (cutoff, reverb room size, drum tone): dark, bright, aggressive, chill, ethereal, melancholic, energetic.

**8 instrument roles** map to templates with automatic multi-module expansion:

| Role | Expands To | Wiring |
|------|-----------|--------|
| `lead` | synth (ADSR) | seq → note |
| `bass` | synth (low octave, ADSR) | seq → note |
| `pad` | synth (slow envelope) | — |
| `drums` | drum-machine | clock → triggers |
| `arpeggio` | sequencer + synth | clock → seq → synth |
| `sequence` | sequencer | clock → seq |
| `texture` | noise synth + granular | synth → granular |
| `modulator` | turing-machine + synth | clock → turing → synth |

**Auto-wiring engine** builds the full signal chain: clock → sequencers → synths → mixer → effects.

**10 musical scales** (major, minor, dorian, phrygian, mixolydian, pentatonic-major/minor, chromatic, whole-tone, blues) x 12 root notes for sequencer note generation.

The `song_analysis` MCP prompt guides Claude through Socratic questions to fill the spec before calling `compose_patch`.

```json
{
  "genre": "dnb",
  "tempo": 175,
  "mood": "aggressive",
  "key": { "root": "E", "scale": "minor" },
  "instruments": [
    { "role": "drums" },
    { "role": "bass" },
    { "role": "arpeggio" }
  ],
  "effects": ["reverb"],
  "controller": { "device": "k2" }
}
```

### Live Control — OSC/FUDI messaging

Send real-time control messages to a running Pd instance. Zero external dependencies — uses Node.js built-in `dgram` (UDP) and `net` (TCP).

| Protocol | Transport | Default Port | Format |
|----------|-----------|--------------|--------|
| **OSC** | UDP | 9000 | Binary (OSC 1.0 spec) |
| **FUDI** | TCP | 3000 | Text (`selector args;\n`) |

Use the `bridge` template to generate the Pd-side receiver patch:
- OSC: `[netreceive -u -b 9000]` → `[oscparse]` → `[route /pd]` → per-route `[send]`
- FUDI: `[netreceive 3000]` → `[route]` → per-route `[send]`

### VCV Rack Generator — `.vcv` patch files

Generates VCV Rack v2 patch files (plain JSON `.vcv` format) from module + cable specifications.

**15 plugin registries** (~400 modules) with port/param IDs scraped from C++ source:

| Plugin | Modules | Source |
|--------|---------|--------|
| **Core** | 9 | AudioInterface2, MIDIToCVInterface, CV-MIDI, Notes, etc. |
| **Fundamental** | 35 | VCO, VCF, VCA, LFO, ADSR, Mixer, SEQ-3, Scope, etc. |
| **Bogaudio** | 111 | VCO, VCF, ADSR, Mix8, FMOp, Noise, etc. |
| **CountModula** | 50+ | Sequencers, gates, logic, quantizers |
| **AudibleInstruments** | 20 | Mutable Instruments clones (Braids, Clouds, Rings, etc.) |
| **ImpromptuModular** | 30+ | Clocked, Foundry, Phrase-Seq, etc. |
| **Befaco** | 32 | EvenVCO, Mixer, Slew, SpringReverb, etc. |
| **Valley** | 9 | Plateau, Dexter, Amalgam, etc. |
| **Stoermelder PackOne** | 42 | STRIP, MIDI-CAT, 8FACE, etc. |
| + 6 more | ~60 | ML Modules, Prism, GlueTheGiant, OrangeLine, StudioSixPlusOne, VCV Recorder |

**Features:**
- Fuzzy port/param resolution (by label, name, partial match, or ID)
- Plugin aliases (`"vcv"` → Fundamental, `"mi"` → AudibleInstruments, `"bg"` → Bogaudio)
- Left-to-right HP positioning with module adjacency chain
- Cable color cycling (5-color palette) or custom hex colors
- Param overrides with default values from registry
- Duplicate input port validation
- Path sanitization for file output

```json
{
  "modules": [
    { "plugin": "Fundamental", "model": "VCO" },
    { "plugin": "Fundamental", "model": "VCF", "params": { "Frequency": 2.0 } },
    { "plugin": "Fundamental", "model": "VCA" },
    { "plugin": "Core", "model": "AudioInterface2" }
  ],
  "cables": [
    { "from": { "module": 0, "port": "Saw" }, "to": { "module": 1, "port": "Audio" } },
    { "from": { "module": 1, "port": "Lowpass" }, "to": { "module": 2, "port": "Channel 1" } },
    { "from": { "module": 2, "port": "Channel 1" }, "to": { "module": 3, "port": "Audio 1" } }
  ]
}
```

### Patch Analyzer — Deep structural analysis
- **Object counts** by category (audio, control, MIDI, math, etc.)
- **Signal flow graph** — adjacency list with topological sort (Kahn's algorithm), cycle detection
- **DSP chain detection** — DFS from audio sources (`osc~`, `noise~`, `adc~`) to sinks (`dac~`, `writesf~`)
- **Complexity scoring** — 0-100 weighted score based on object count, connection density, subpatch depth, audio chains, and object variety

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/j0KZ/synthlab-mcp-server.git
cd synthlab-mcp-server
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "synthlab": {
      "command": "npx",
      "args": ["synthlab-mcp-server"]
    }
  }
}
```

Or from a local clone:

```json
{
  "mcpServers": {
    "synthlab": {
      "command": "node",
      "args": ["/absolute/path/to/synthlab-mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Use it

Open Claude Desktop and ask:

> *"Parse the file /path/to/my-patch.pd and explain what it does"*

> *"Create a rack with clock, sequencer, saw synth, reverb, and mixer — wire clock to sequencer, sequencer to synth, synth through reverb to mixer"*

> *"Create a VCV Rack patch with Fundamental VCO, VCF, and AudioInterface2 — saw output through lowpass filter to audio"*

> *"Compose a dark techno track with drums, bass, and arpeggio"*
>
> *"Send /pd/tempo 140 to my running Pd instance"*

---

## MCP Tools

### `parse_patch`
Parse a `.pd` file and return a structured description.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `generate_patch`
Generate a valid `.pd` file from a JSON specification of nodes and connections.

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
Generate a patch from a parameterized template (11 available).

| Parameter | Type | Description |
|-----------|------|-------------|
| `template` | `string` | Template name (see table above) |
| `params` | `object?` | Template-specific parameters |
| `outputPath` | `string?` | Write to file (optional) |

### `create_rack`
Assemble multiple modules into a rack with inter-module wiring and MIDI controller integration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modules` | `array` | Module specs: `{ template, params?, id?, filename? }` |
| `wiring` | `array?` | Connections: `{ from, output, to, input }` |
| `controller` | `object?` | MIDI controller: `{ device, midiChannel?, mappings? }` |
| `outputDir` | `string?` | Directory to write all files |

### `compose_patch`
Generate a complete wired Pd rack from a high-level song description (genre, mood, tempo, key, instruments, effects, controller).

| Parameter | Type | Description |
|-----------|------|-------------|
| `genre` | `string` | Genre preset (ambient, techno, house, dnb, experimental, idm, minimal, drone, noise) |
| `tempo` | `number?` | Override BPM (clamped to genre range) |
| `mood` | `string?` | Mood adjustment (dark, bright, aggressive, chill, ethereal, melancholic, energetic) |
| `key` | `object?` | Musical key: `{ root: NoteName, scale: ScaleType }` |
| `instruments` | `array?` | Instrument specs: `{ role, id?, template?, params? }` |
| `effects` | `array?` | Effect chain: `["reverb", "granular"]` |
| `controller` | `object?` | MIDI controller: `{ device, midiChannel?, mappings? }` |

### `send_message`
Send a control message to a running Pd instance via OSC or FUDI.

| Parameter | Type | Description |
|-----------|------|-------------|
| `protocol` | `"osc" \| "fudi"` | Transport protocol (default: `"osc"`) |
| `host` | `string?` | Target host (default: `"127.0.0.1"`) |
| `port` | `number?` | Target port (default: 9000 OSC / 3000 FUDI) |
| `address` | `string` | Message address (e.g. `/pd/tempo`) |
| `args` | `array?` | Message arguments (numbers or strings) |

### `list_vcv_modules`
Discover available VCV Rack modules, ports, and params before building a patch.

| Parameter | Type | Description |
|-----------|------|-------------|
| `plugin` | `string` | Plugin name or alias (`"Fundamental"`, `"mi"`, `"bg"`) |
| `module` | `string?` | Module slug for detailed port/param info. Omit to list all modules |

Call with just `plugin` to get all module slugs with tags and HP. Call with `plugin` + `module` to get exact input/output port names and param names for cabling. Includes plugin version for freshness tracking.

### `generate_vcv`
Generate a VCV Rack `.vcv` patch file from module and cable specifications.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modules` | `array` | Module specs: `{ plugin, model, params? }` |
| `cables` | `array?` | Cable connections: `{ from: {module, port}, to: {module, port}, color? }` |
| `outputPath` | `string?` | Write `.vcv` file (optional) |

Supports 15 plugins with aliases: `"vcv"` → Fundamental, `"mi"` → AudibleInstruments, `"bg"` → Bogaudio, `"stoermelder"` → PackOne, etc.

### MCP Prompts

#### `song_analysis`
Guided Socratic conversation to design a song step by step (genre → mood → tempo → key → instruments → effects → controller) then call `compose_patch`.

---

## Project Structure

```
src/                            # ~9,500 lines (+ 42,800 registry data)
  index.ts                      # MCP server — 10 tools + 1 prompt, stdio transport
  types.ts                      # PdPatch, PdCanvas, PdNode, PdConnection
  constants.ts                  # Format constants, layout defaults
  core/
    parser.ts                   # .pd text -> AST
    serializer.ts               # AST -> .pd text + buildPatch()
    object-registry.ts          # ~100 Pd-vanilla objects with port counts
    validator.ts                # 9 structural checks
  composer/
    types.ts                    # SongSpec, Genre, Mood, InstrumentRole types
    presets.ts                  # 9 genre presets (tempo, instruments, key, mood)
    moods.ts                    # 7 mood adjustments (cutoff, reverb, drum tone)
    scales.ts                   # Scale generator (10 scales × 12 keys → MIDI notes)
    wiring-rules.ts             # Auto-wiring engine (clock→seq→synth→mixer→fx)
    song-mapper.ts              # SongSpec → CreateRackInput mapper
  schemas/
    patch.ts                    # Zod schemas for parse/generate
    analyze.ts                  # Zod schemas for validate/analyze
    template.ts                 # Zod schema for create_from_template
    rack.ts                     # Zod schema for create_rack
    control.ts                  # Zod schema for send_message
    compose.ts                  # Zod schema for compose_patch
    vcv.ts                      # Zod schemas for list_vcv_modules + generate_vcv
  templates/
    index.ts                    # Template registry + dispatcher (11 templates)
    port-info.ts                # PortInfo, RackableSpec types for wiring
    validate-params.ts          # Runtime param validation
    synth.ts                    # Oscillator -> filter -> VCA -> dac~
    sequencer.ts                # MIDI step sequencer
    drum-machine.ts             # 4 analog drum voices — 3-layer (voices/filter/mix)
    reverb-template.ts          # adc~ -> reverb -> wet/dry -> dac~
    mixer.ts                    # N-channel mixer with mute gates
    clock.ts                    # Master clock with divided outputs
    chaos.ts                    # Logistic map chaos generator
    maths.ts                    # Function generator (rise/fall envelopes)
    turing-machine.ts           # Shift register random sequencer
    granular.ts                 # Granular synthesis sampler
    bridge.ts                   # OSC/FUDI network receiver
    modules/
      compose.ts                # Module composition with index offsetting
      oscillator.ts             # 4 variants: sine, saw, square, noise
      filter.ts                 # 5 variants: lowpass, highpass, bandpass, moog, korg
      vca.ts                    # VCA module (*~)
      envelope.ts               # 3 variants: adsr, ar, decay
      delay.ts                  # 2 variants: simple, pingpong
      reverb.ts                 # 2 variants: schroeder, simple
  controllers/
    auto-mapper.ts              # 4-phase auto-mapping (custom -> amp -> freq -> rest)
    pd-controller.ts            # Input controller patch builder
    pd-output-controller.ts     # Output controller (ctlout feedback)
    param-injector.ts           # Parameter bus injection
    k2-deck-config.ts           # K2 LED configuration generator
  devices/
    index.ts                    # Device registry
    k2.ts                       # Korg nanoKONTROL2 (34 controls)
    microfreak.ts               # Arturia MicroFreak (21 outputs)
    tr8s.ts                     # Roland TR-8S (51 bidirectional)
  network/
    osc-encoder.ts              # OSC 1.0 binary encoder (4-byte aligned)
    fudi-formatter.ts           # FUDI text formatter
    udp-sender.ts               # UDP fire-and-forget (dgram)
    tcp-sender.ts               # TCP send/receive (net)
  vcv/
    types.ts                    # Registry, spec, and serialization types
    generator.ts                # Module resolution, cables, positioning
    positioner.ts               # Left-to-right HP layout
    registry.ts                 # Plugin lookup with aliases + fuzzy matching
    validate-vcv-params.ts      # Claude Desktop quirk coercion
    registry/                   # 15 auto-generated plugin registries
      core.ts                   # 9 modules (manual — complex ENUMS)
      fundamental.ts            # 35 modules
      bogaudio.ts               # 111 modules
      audibleinstruments.ts     # 20 modules
      befaco.ts                 # 32 modules
      countmodula.ts            # 50+ modules
      impromptumodular.ts       # 30+ modules
      valley.ts                 # 9 modules
      stoermelder-packone.ts    # 42 modules
      + 6 more                  # ml-modules, orangeline, prism, etc.
  tools/
    parse.ts                    # parse_patch tool handler
    generate.ts                 # generate_patch tool handler
    validate.ts                 # validate_patch tool handler
    analyze.ts                  # analyze_patch tool handler
    template.ts                 # create_from_template tool handler
    rack.ts                     # create_rack + combined patch builder
    compose.ts                  # compose_patch tool handler
    control.ts                  # send_message tool handler
    list-vcv.ts                 # list_vcv_modules tool handler (discovery)
    vcv.ts                      # generate_vcv tool handler
  wiring/
    bus-injector.ts             # Inter-module wiring (throw~/catch~, send/receive)
  utils/
    resolve-source.ts           # File-path vs raw-text resolver

scripts/                        # ~700 lines
  build-vcv-registry.ts         # Clone repos -> parse C++ -> generate .ts
  parse-cpp-enums.ts            # C++ enum parser (ParamIds, InputIds, etc.)
  parse-svg-width.ts            # SVG panel width -> HP conversion
  update-readme-stats.ts        # Auto-update README tool/test counts

tests/                          # 619 tests, ~6,500 lines
  parser.test.ts                # 14 — parsing, subpatches, arrays, edge cases
  serializer.test.ts            # 8 — round-trip, spec builder, escaping
  object-registry.test.ts       # 37 — port counts, aliases, variable objects
  validator.test.ts             # 20 — each check type + fixtures
  analyze.test.ts               # 29 — counts, flow, DSP chains, complexity, formatting
  composer/
    composer.test.ts            # 42 — scales, presets, moods, wiring, mapper, validation
  controllers/
    controller.test.ts          # 80 — auto-mapper, controller patches, device profiles
  templates/
    compose.test.ts             # 8 — module composition, wiring, autoLayout
    modules.test.ts             # 17 — all module variants
    templates.test.ts           # 46 — complete template round-trips
    edge-cases.test.ts          # 106 — param validation, coercion, boundaries
    bridge.test.ts              # 3 — OSC/FUDI bridge variants
  network/
    osc-encoder.test.ts         # 8 — binary encoding, padding, type inference
    fudi-formatter.test.ts      # 3 — text formatting
    udp-sender.test.ts          # 3 — UDP send, socket error mock
    control.test.ts             # 6 — mock UDP/TCP servers, end-to-end
  tools/
    rack.test.ts                # 13 — rack assembly, layout, file writing
    rack-wiring.test.ts         # 13 — wiring integration, bus injection
    compose.test.ts             # 14 — compose_patch tool, genres, validation, coercion
    list-vcv.test.ts            # 9 — discovery tool, aliases, coercion
    vcv.test.ts                 # 8 — tool handler, format, sanitization
  utils/
    resolve-source.test.ts      # 5 — raw text vs file path resolution
  vcv/
    generator.test.ts           # 15 — modules, cables, positions, errors
    registry.test.ts            # 53 — 15 plugins, module aliases, fuzzy resolution, formatting
    positioner.test.ts          # 5 — HP layout, adjacency chain
    validate-vcv-params.test.ts # 8 — coercion, empty arrays, booleans
  scripts/
    parse-cpp-enums.test.ts     # 25 — enums, ENUMS macro, removed, labels
    parse-svg-width.test.ts     # 4 — mm/px to HP conversion
  wiring/
    bus-injector.test.ts        # 17 — connection helpers, validation
  fixtures/
    hello-world.pd              # Minimal: osc~ -> *~ -> dac~
    midi-sequencer.pd           # 4-step sequencer with noteout
    subpatch.pd                 # Nested canvas with inlet~/outlet~
    broken-connections.pd       # Invalid connections for validator
    orphan-objects.pd           # Disconnected objects
    complex-patch.pd            # Multi-chain audio + control + subpatch
```

---

## Development

```bash
npm run build        # Compile with tsup (ESM + declarations)
npm run dev          # Watch mode
npm run test         # Run vitest (619 tests)
npm run lint         # Type-check with tsc --noEmit
npm run inspect      # Test server with MCP Inspector
```

### VCV Registry rebuild (only needed when plugins update)

```bash
npm run vcv:build-registry   # Clone repos -> parse C++ -> regenerate src/vcv/registry/*.ts
npm run build                # Rebundle
```

### Update README stats (tool/test counts)

```bash
npm run update-stats         # Patches README with actual tool + test counts
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** (strict mode) | Type-safe parser and serializer |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | Protocol implementation |
| **Zod** | Runtime input validation |
| **Vitest** | Test runner (619 tests) |
| **tsup** | Bundler (ESM output, 1.04 MB) |
| **tsx** | TypeScript execution for build scripts |
| **Zero runtime deps** beyond MCP SDK + Zod | OSC via `dgram`, FUDI via `net` |

---

## Roadmap

All phases complete. Recent improvements:

1. **Core** — Parser + serializer + MCP scaffold
2. **Analysis** — Object registry, signal flow graph, DSP chain detection, complexity scoring
3. **Templates** — 11 parameterized instruments with modular two-tier composition
4. **Rack Builder** — `create_from_template` + `create_rack` (multi-module assembly)
5. **Wiring** — Inter-module buses (throw~/catch~, send/receive, clock sync)
6. **MIDI Controllers** — K2, MicroFreak, TR-8S profiles with auto-mapping
7. **Live Control** — OSC/FUDI messaging (`send_message` tool + `bridge` template)
8. **VCV Rack** — `.vcv` generation with 15-plugin registry (~500 modules), module discovery + aliases
9. **Song Composer** — `compose_patch` tool + `song_analysis` Socratic prompt
10. **Drum Machine v2** — 3-layer architecture (voices/filter/mix), sub-bass kick, bob~ warmth, metallic hi-hat, 808-style clap, per-voice volume control

---

## License

MIT
