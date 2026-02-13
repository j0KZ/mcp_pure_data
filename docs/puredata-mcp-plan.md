# synthlab-mcp

> MCP Server for Pure Data — parse, generate, analyze, and control Pd patches with AI

**Repo name**: `synthlab-mcp`  
**npm package**: `synthlab-mcp-server`  
**License**: MIT  
**Language**: TypeScript  
**Transport**: stdio (local, compatible with Claude Desktop / Claude Code / Cursor)

---

## Competitive Analysis

| Feature | nikmaniatis/Pd-MCP-Server | **synthlab-mcp** (ours) |
|---|---|---|
| Parse .pd files | ❌ | ✅ Full AST |
| Generate .pd files | ❌ | ✅ Programmatic |
| Patch templates | ❌ | ✅ Synths, sequencers, effects |
| Analyze patches | ❌ | ✅ Signal flow, objects, connections |
| OSC live control | ❌ (FUDI only) | ✅ OSC + FUDI |
| Patch validation | ❌ | ✅ Broken connections, missing objects |
| Portfolio quality | Minimal README | ✅ Full docs, examples, demos |
| npm publishable | ❌ | ✅ npx-ready |

---

## Architecture

```
synthlab-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── CHANGELOG.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── constants.ts             # Pd format constants, object registry
│   ├── types.ts                 # TypeScript interfaces for Pd AST
│   ├── tools/
│   │   ├── parse.ts             # parse_patch — .pd file → AST
│   │   ├── generate.ts          # generate_patch — AST/description → .pd file
│   │   ├── analyze.ts           # analyze_patch — stats, signal flow, warnings
│   │   ├── template.ts          # create_from_template — predefined patch generators
│   │   ├── validate.ts          # validate_patch — check for errors
│   │   └── control.ts           # send_message — OSC/FUDI to running Pd
│   ├── core/
│   │   ├── parser.ts            # .pd text → PdPatch AST
│   │   ├── serializer.ts        # PdPatch AST → .pd text
│   │   ├── validator.ts         # Structural validation logic
│   │   └── object-registry.ts   # Known Pd objects + inlet/outlet metadata
│   ├── templates/
│   │   ├── synth-basic.ts       # Simple subtractive synth
│   │   ├── sequencer-midi.ts    # Step sequencer with MIDI out
│   │   ├── effect-delay.ts      # Delay/echo effect
│   │   ├── effect-reverb.ts     # Schroeder reverb
│   │   ├── osc-receiver.ts      # OSC input → Pd control
│   │   └── mixer-stereo.ts      # Basic stereo mixer
│   ├── network/
│   │   ├── osc-client.ts        # Send OSC messages to Pd
│   │   └── fudi-client.ts       # Send FUDI messages to Pd
│   └── schemas/
│       ├── patch.ts             # Zod schemas for patch operations
│       ├── template.ts          # Zod schemas for template params
│       └── control.ts           # Zod schemas for OSC/FUDI params
├── examples/
│   ├── patches/
│   │   ├── hello-world.pd       # Minimal example
│   │   ├── midi-sequencer.pd    # Generated sequencer
│   │   └── synth-poly.pd        # Polyphonic synth
│   └── workflows/
│       ├── create-synth.md      # "Build me a synth" walkthrough
│       └── analyze-patch.md     # "Explain this patch" walkthrough
├── tests/
│   ├── parser.test.ts
│   ├── serializer.test.ts
│   ├── validator.test.ts
│   └── templates.test.ts
└── docs/
    ├── pd-file-format.md        # .pd format reference
    ├── tool-reference.md        # All tools documented
    └── architecture.md          # Design decisions
```

---

## MCP Tools (6 tools)

### 1. `parse_patch`
**Input**: File path or raw .pd text  
**Output**: Structured AST (canvases, objects, connections, comments)  
**Use case**: "Read my patch and tell me what it does"

### 2. `generate_patch`  
**Input**: Description of desired patch OR AST structure  
**Output**: Valid .pd file content + file path  
**Use case**: "Create a 4-voice polysynth with ADSR and filter"

### 3. `analyze_patch`
**Input**: File path or .pd text  
**Output**: Object count, signal flow graph, DSP chain, warnings, complexity score  
**Use case**: "What's the signal chain in this patch?"

### 4. `create_from_template`
**Input**: Template name + parameters (e.g., `{template: "sequencer-midi", steps: 16, bpm: 120}`)  
**Output**: Generated .pd file  
**Use case**: "Make me a 16-step MIDI sequencer at 120 BPM"

### 5. `validate_patch`
**Input**: File path or .pd text  
**Output**: Errors, warnings (orphan objects, broken connections, missing externals)  
**Use case**: "Check if my patch has any issues"

### 6. `send_message`
**Input**: Protocol (OSC/FUDI), host, port, message path, args  
**Output**: Confirmation  
**Use case**: "Send /tempo 140 to my running Pd instance"

---

## Pd File Format — Core Syntax

```
#N canvas X Y WIDTH HEIGHT FONTSIZE;        ← Canvas/window
#X obj X Y OBJECTNAME [ARGS...];            ← Object box
#X msg X Y CONTENT;                         ← Message box
#X floatatom X Y ...;                       ← Number box
#X symbolatom X Y ...;                      ← Symbol box
#X text X Y COMMENT;                        ← Comment
#X connect FROM_OBJ FROM_OUTLET TO_OBJ TO_INLET;  ← Connection
#X restore X Y pd SUBPATCH_NAME;            ← Close subpatch
#N canvas X Y W H NAME VIS;                 ← Subpatch
#X array NAME SIZE TYPE FLAGS;              ← Array/table
```

### AST Type Structure (types.ts)

```typescript
interface PdPatch {
  canvases: PdCanvas[];
}

interface PdCanvas {
  id: number;
  x: number; y: number;
  width: number; height: number;
  fontSize: number;
  name?: string;       // for subpatches
  isSubpatch: boolean;
  nodes: PdNode[];
  connections: PdConnection[];
}

interface PdNode {
  id: number;          // index in canvas
  type: 'obj' | 'msg' | 'floatatom' | 'symbolatom' | 'text' | 'array';
  x: number; y: number;
  name?: string;       // object name (e.g., 'osc~', 'metro')
  args: (string | number)[];
  raw: string;         // original line
}

interface PdConnection {
  fromNode: number;
  fromOutlet: number;
  toNode: number;
  toInlet: number;
}
```

---

## Build Phases

### Phase 1: Core Parser + Serializer (MVP — Week 1)
1. Project scaffold (package.json, tsconfig, eslint)
2. Implement `types.ts` — full AST interfaces
3. Implement `parser.ts` — .pd text → AST
4. Implement `serializer.ts` — AST → .pd text
5. Roundtrip tests: parse → serialize → parse = identical
6. Wire up `parse_patch` and `generate_patch` tools
7. MCP server boots, tools register, inspector works

**Verification**: Parse a real .pd file (your M32 Midi patch), serialize back, open in Pd

### Phase 2: Analysis + Validation (Week 2)
1. Implement `object-registry.ts` — known objects with inlet/outlet counts
2. Implement `validator.ts` — structural checks
3. Implement `analyze_patch` tool — stats, signal flow, DSP detection
4. Implement `validate_patch` tool
5. Tests with intentionally broken patches

**Verification**: Analyze a complex patch, get accurate object graph

### Phase 3: Templates (Week 2-3)
1. Build template engine (parameterized AST construction)
2. Implement 6 templates (synth, sequencer, delay, reverb, osc-receiver, mixer)
3. Wire up `create_from_template` tool
4. Generated patches open and work in Pd

**Verification**: Generate each template, open in Pd, verify audio/MIDI works

### Phase 4: Live Control (Week 3)
1. Implement `osc-client.ts` (UDP, no external deps — use Node dgram)
2. Implement `fudi-client.ts` (TCP)
3. Wire up `send_message` tool
4. Test with running Pd instance + `netreceive` / `oscparse`

**Verification**: Send OSC from MCP → Pd responds (e.g., change oscillator frequency)

### Phase 5: Portfolio Polish (Week 4)
1. README with badges, GIF demos, architecture diagram
2. Example workflows with screenshots
3. npm publish setup (`npx synthlab-mcp-server`)
4. GitHub Actions CI
5. CHANGELOG, contributing guide
6. Example patches that showcase the tool

---

## Key Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0"
  }
}
```

**Zero runtime deps beyond MCP SDK + Zod.** OSC uses Node's built-in `dgram`. FUDI uses Node's built-in `net`. No `osc-js` or `python-osc` needed.

---

## README Structure (Portfolio Sell)

```markdown
# 🎛️ synthlab-mcp

> AI-powered tools for Pure Data — parse, generate, analyze, and control patches

[Demo GIF]

## What is this?

An MCP server that lets AI assistants understand and create Pure Data patches.
Ask Claude to build you a synthesizer, analyze your signal chain, or control
a live performance — all through natural language.

## Features
- 📖 **Parse** — Read any .pd file and understand its structure
- 🔧 **Generate** — Create patches from descriptions or templates
- 🔍 **Analyze** — Signal flow, object graph, complexity metrics
- ✅ **Validate** — Find broken connections and missing objects
- 🎹 **Templates** — Synths, sequencers, effects, mixers
- 📡 **Live Control** — Send OSC/FUDI to running Pd instances

## Quick Start
[npx installation + Claude Desktop config]

## Examples
[Workflow screenshots/GIFs]

## Tool Reference
[All 6 tools documented]

## Architecture
[Diagram + design decisions]
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Pd format edge cases (externals, GOP, arrays) | Medium | Start with vanilla objects, expand |
| Roundtrip fidelity (parse→serialize loses formatting) | Medium | Preserve raw lines, only modify what's needed |
| OSC firewall issues | Low | Document port config, fallback to FUDI |
| Template patches sound bad | Low | Test with actual audio, iterate |
| Scope creep (adding too many templates) | Medium | Ship 6, let users contribute more |

---

## Commands to Start

```bash
mkdir synthlab-mcp-server && cd synthlab-mcp-server
npm init -y
npm i @modelcontextprotocol/sdk zod
npm i -D typescript vitest tsup @types/node
npx tsc --init
```

---

## Success Criteria

- [ ] `parse_patch` correctly parses 10+ real-world .pd files
- [ ] `generate_patch` creates patches that open without errors in Pd
- [ ] Roundtrip (parse → serialize) preserves all connections and objects
- [ ] Templates produce working audio in Pd
- [ ] OSC messages reach a running Pd instance
- [ ] `npx synthlab-mcp-server` works out of the box
- [ ] README gets you from zero to working in 2 minutes
