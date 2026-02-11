# Pure Data MCP Server

## Project Overview
MCP (Model Context Protocol) server that enables Claude to read, analyze, generate, and control Pure Data (Pd) patches. Targets Pd-vanilla compatible patches with focus on MIDI workflows.

## Architecture
- **Runtime**: Node.js (TypeScript)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Communication with Pd**: OSC via `osc-js` or raw TCP via `net` module
- **Patch parsing**: Custom parser for .pd text format

## Directory Structure
```
pd-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── read-patch.ts     # Parse and describe .pd files
│   │   ├── create-patch.ts   # Generate .pd files from specs
│   │   ├── analyze-patch.ts  # Debug, validate, trace signal flow
│   │   └── control-pd.ts     # Send OSC/TCP messages to running Pd
│   ├── parser/
│   │   ├── pd-parser.ts      # .pd file format parser
│   │   ├── pd-writer.ts      # .pd file format writer
│   │   └── pd-types.ts       # Type definitions for Pd objects
│   ├── osc/
│   │   ├── client.ts         # OSC client for Pd communication
│   │   └── mappings.ts       # Common OSC address patterns
│   └── utils/
│       ├── midi.ts           # MIDI note/CC mappings and helpers
│       └── validation.ts     # Patch validation utilities
├── tests/
│   ├── parser.test.ts
│   ├── writer.test.ts
│   └── fixtures/             # Sample .pd files for testing
├── .claude/
│   └── skills/               # Claude Code skills for this project
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## MCP Tools Exposed

### `pd_read_patch`
- Input: file path to .pd file
- Output: structured description of patch (objects, connections, parameters)
- Use: "What does this patch do?"

### `pd_create_patch`
- Input: JSON spec describing desired patch
- Output: valid .pd file
- Use: "Create a 16-step MIDI sequencer"

### `pd_analyze_patch`
- Input: file path to .pd file
- Output: warnings, orphan objects, broken connections, signal flow graph
- Use: "Debug my patch" / "Why is there no output?"

### `pd_send_message`
- Input: OSC address + args, or raw Pd message
- Output: confirmation / response
- Requires: Pd running with [netreceive] or OSC external
- Use: "Set tempo to 140 BPM" / "Send note C4 on channel 1"

### `pd_list_objects`
- Input: optional category filter
- Output: available Pd objects with descriptions
- Use: "What objects can I use for FM synthesis?"

## .pd File Format Reference
- Plain text, line-based
- Lines start with `#N` (canvas), `#X` (object/message/connection), `#A` (array data)
- Object: `#X obj <x> <y> <name> [args...];`
- Message: `#X msg <x> <y> <content>;`
- Connection: `#X connect <src_obj> <src_outlet> <dst_obj> <dst_inlet>;`
- Coordinates are in pixels, origin top-left
- Objects indexed by order of appearance (0-based)

## Code Conventions
- TypeScript strict mode
- Error handling: every tool returns structured errors, never throws uncaught
- All .pd output must be validated against parser before returning
- Tests required for parser/writer (round-trip: parse → write → parse must be identical)
- Use Zod for input validation on tool parameters

## Key Constraints
- Target Pd-vanilla objects only (no externals) unless user specifies
- Generated patches must open cleanly in Pd 0.54+
- OSC communication assumes localhost unless configured
- Default OSC port: 9000 (send to Pd), 9001 (receive from Pd)
- MIDI note numbers: 0-127, middle C = 60

## Development Commands
```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm run test           # Run tests
npm run inspect        # Test MCP server with inspector
npx @anthropic-ai/claude-code # Run Claude Code in project
```

## Dependencies
```
@modelcontextprotocol/sdk  # MCP protocol
zod                        # Input validation
osc-js                     # OSC communication (if using OSC)
```

## Common Pd Object Categories (for reference)
- **Math**: +, -, *, /, mod, abs, pow, sqrt, exp, log
- **MIDI**: notein, noteout, ctlin, ctlout, bendin, bendout, pgmin, pgmout
- **Time**: metro, delay, timer, realtime, pipe
- **Audio**: osc~, phasor~, noise~, lop~, hip~, bp~, dac~, adc~
- **Control**: bang, toggle, number, slider, select, route, pack, unpack
- **Data**: float, symbol, list, array, table, text
- **Network**: netsend, netreceive, oscformat, oscparse (Pd 0.54+)
