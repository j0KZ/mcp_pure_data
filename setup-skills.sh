#!/bin/bash
# Setup .claude/skills for pd-mcp project
# Run from project root: bash setup-skills.sh

set -e

SKILLS_DIR=".claude/skills"
mkdir -p "$SKILLS_DIR"

# =============================================================================
# SKILL 1: Pure Data File Format
# =============================================================================
cat > "$SKILLS_DIR/pd-file-format.md" << 'SKILL_EOF'
# Skill: Pure Data .pd File Format

## Purpose
Parse, understand, and generate valid Pure Data patch files (.pd).

## .pd Syntax Rules

### Canvas (window) declaration
```
#N canvas <x> <y> <width> <height> <font-size>;
```
Example: `#N canvas 0 50 800 600 12;`

### Objects
```
#X obj <x> <y> <object-name> [arg1 arg2 ...];
```
Example: `#X obj 100 200 osc~ 440;`

### Messages
```
#X msg <x> <y> <content>;
```
Example: `#X msg 50 100 bang;`

### Number boxes
```
#X floatatom <x> <y> <width> <lower> <upper> <label-pos> <label> <receive> <send>;
```

### Connections
```
#X connect <source-index> <outlet> <dest-index> <inlet>;
```
- Indices are 0-based, in order of object appearance in file
- Outlet/inlet numbering: 0 = leftmost

### Subpatches
```
#N canvas <x> <y> <w> <h> <name> <visible>;
... objects inside ...
#X restore <x> <y> pd <name>;
```

### Arrays
```
#X array <name> <size> float 0;
#A 0 <val1> <val2> ...;
```

### GUI Objects
```
#X obj <x> <y> bng <size> <hold> <intrrpt> <init> <send> <receive> <label> ...;
#X obj <x> <y> tgl <size> <init> <send> <receive> <label> ...;
#X obj <x> <y> nbx <width> <height> <min> <max> ...;
#X obj <x> <y> vsl <width> <height> <min> <max> ...;
#X obj <x> <y> hsl <width> <height> <min> <max> ...;
```

## Parsing Strategy
1. Read file line by line (lines end with `;`)
2. Multi-line statements: concatenate until `;` found
3. Track object index counter (increments per `#X obj`, `#X msg`, `#X floatatom`, etc.)
4. Build adjacency list from `#X connect` lines
5. Handle nested canvases with stack-based depth tracking

## Validation Rules
- Every connection must reference valid object indices
- Outlet/inlet numbers must be within object's range
- Canvas declarations must be balanced (each `#N canvas` has matching `#X restore` except root)
- No duplicate connections allowed
- Coordinates must be non-negative integers

## Common Pitfalls
- Semicolons inside messages need escaping: `\;`
- Commas in messages separate multiple messages: `1 2 3, 4 5 6`
- Dollar signs ($1, $2) are patch-local variables
- Tilde (~) suffix = audio rate object (osc~, dac~, etc.)
- Object names are case-sensitive
SKILL_EOF

# =============================================================================
# SKILL 2: MCP Server Development
# =============================================================================
cat > "$SKILLS_DIR/mcp-server-patterns.md" << 'SKILL_EOF'
# Skill: MCP Server Development Patterns

## Purpose
Build robust MCP servers following the Model Context Protocol spec.

## Server Structure (TypeScript)
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "pd-mcp",
  version: "1.0.0",
});

// Register a tool
server.tool(
  "tool_name",
  "Description of what this tool does",
  {
    // Zod schema for parameters
    param1: z.string().describe("What this param is"),
    param2: z.number().optional().describe("Optional param"),
  },
  async ({ param1, param2 }) => {
    // Tool implementation
    return {
      content: [{ type: "text", text: "result" }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Tool Design Principles
1. **One tool = one action**. Don't combine read + write in one tool.
2. **Return structured text**, not raw data. Claude needs to understand it.
3. **Always validate inputs** with Zod before processing.
4. **Errors are content**, not exceptions. Return error descriptions in content array.
5. **isError flag**: Set `isError: true` in response when tool fails.

## Error Handling Pattern
```typescript
server.tool("my_tool", "desc", { path: z.string() }, async ({ path }) => {
  try {
    const result = await doWork(path);
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});
```

## Resource Pattern (for exposing .pd files)
```typescript
server.resource(
  "patch://{path}",
  "A Pure Data patch file",
  async (uri) => {
    const path = uri.pathname;
    const content = await fs.readFile(path, "utf-8");
    return { contents: [{ uri: uri.href, text: content, mimeType: "text/plain" }] };
  }
);
```

## Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Package.json essentials
```json
{
  "type": "module",
  "bin": { "pd-mcp": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
  }
}
```

## Claude Desktop Config
```json
{
  "mcpServers": {
    "pd-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/pd-mcp/dist/index.js"],
      "env": {
        "PD_PATCHES_DIR": "/path/to/patches"
      }
    }
  }
}
```
SKILL_EOF

# =============================================================================
# SKILL 3: MIDI Reference
# =============================================================================
cat > "$SKILLS_DIR/midi-reference.md" << 'SKILL_EOF'
# Skill: MIDI Reference for Pure Data

## Purpose
Quick reference for MIDI conventions used in Pd patch generation and control.

## Note Numbers
- C-1 = 0, C0 = 12, C1 = 24, C2 = 36, C3 = 48
- **Middle C (C4) = 60**
- C5 = 72, C6 = 84, C7 = 96, C8 = 108, G9 = 127
- Formula: MIDI note = (octave + 1) * 12 + semitone
- Semitones: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11

## Frequency Conversion
- `freq = 440 * 2^((note - 69) / 12)`
- In Pd: `[mtof]` and `[ftom]` objects

## Pd MIDI Objects
| Object | Direction | Description |
|--------|-----------|-------------|
| notein | IN | Receive note + velocity + channel |
| noteout | OUT | Send note + velocity + channel |
| ctlin | IN | Receive CC number + value + channel |
| ctlout | OUT | Send CC number + value + channel |
| bendin | IN | Receive pitch bend + channel |
| bendout | OUT | Send pitch bend + channel |
| pgmin | IN | Receive program change + channel |
| pgmout | OUT | Send program change + channel |
| midiin | IN | Raw MIDI bytes |
| midiout | OUT | Raw MIDI bytes |
| sysexin | IN | SysEx messages |
| midirealtimein | IN | Clock, start, stop, continue |

## Common CC Numbers
- 1: Modulation wheel
- 7: Volume
- 10: Pan
- 11: Expression
- 64: Sustain pedal
- 71: Resonance (filter)
- 74: Cutoff frequency
- 91: Reverb
- 93: Chorus
- 120: All sound off
- 123: All notes off

## Moog Mother-32 Specifics (via MIDI)
- Mono synth, responds on configurable MIDI channel
- Note priority: last note
- Velocity mapped to VCA or filter (configurable)
- CC assignments configurable via front panel
- Sequencer: 32 steps, can be MIDI synced
- Clock: responds to MIDI clock (24 ppqn)
- MIDI channel set via: SHIFT + KB (hold) + select channel

## Pd Patterns for MIDI Processing
### Note filter by channel
```
[notein]
|    |    |
[route 1]  <- channel 1 only
|    |
[note] [velocity]
```

### Velocity-scaled noteout
```
[pack 0 0 1]
|
[noteout]
```

### MIDI clock (24 ppqn)
```
[midirealtimein]
|
[select 248]  <- 0xF8 = clock tick
|
[bang]
```
SKILL_EOF

# =============================================================================
# SKILL 4: OSC Communication
# =============================================================================
cat > "$SKILLS_DIR/osc-communication.md" << 'SKILL_EOF'
# Skill: OSC Communication with Pure Data

## Purpose
Control running Pd instances from the MCP server via OSC or TCP.

## Option A: Native Pd (0.54+) — oscformat/oscparse
```
[oscformat /path]      <- creates OSC messages
|
[netsend -u -b]        <- UDP send

[netreceive -u -b 9000]  <- UDP receive on port 9000
|
[oscparse]
|
[route /tempo /note /cc]
```

## Option B: mrpeach externals (older Pd)
```
[packOSC]
|
[udpsend 127.0.0.1 9000]

[udpreceive 9001]
|
[unpackOSC]
|
[routeOSC /tempo /note]
```

## Option C: Raw TCP with netsend/netreceive
Pd side:
```
[netreceive 3000]  <- TCP server on port 3000
|
[route tempo note cc]
```

Node.js side:
```typescript
import net from "net";
const client = net.createConnection({ port: 3000 }, () => {
  // Pd expects semicolon-terminated messages
  client.write("tempo 140;\n");
  client.write("note 60 100 1;\n");
});
```

## OSC Address Conventions for pd-mcp
```
/pd/tempo <float>           — set BPM
/pd/note <int> <int> <int>  — note velocity channel
/pd/cc <int> <int> <int>    — cc# value channel
/pd/bang                     — trigger bang
/pd/param/<name> <float>    — set named parameter
/pd/seq/step <int> <int>    — set step N to note
/pd/seq/start               — start sequencer
/pd/seq/stop                — stop sequencer
/pd/patch/load <string>     — load patch by name
```

## Node.js OSC Implementation
```typescript
import OSC from "osc-js";

const osc = new OSC({
  plugin: new OSC.DatagramPlugin({
    send: { host: "127.0.0.1", port: 9000 },
    open: { host: "127.0.0.1", port: 9001 },
  }),
});

osc.open();

// Send message
osc.send(new OSC.Message("/pd/tempo", 140));

// Receive
osc.on("/pd/response/*", (message) => {
  console.log(message.address, message.args);
});
```

## Pd Helper Patch (include with MCP)
Create a `_mcp_bridge.pd` that users load alongside their patch:
```
#N canvas 0 50 450 300 12;
#X obj 50 50 netreceive -u -b 9000;
#X obj 50 80 oscparse;
#X obj 50 110 route /pd;
#X obj 50 140 route tempo note cc bang param;
#X obj 50 200 s pd-tempo;    <- sends to [r pd-tempo] anywhere
#X obj 120 200 s pd-note;
#X obj 190 200 s pd-cc;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 2 0 3 0;
#X connect 3 0 4 0;
#X connect 3 1 5 0;
#X connect 3 2 6 0;
```

## Latency Considerations
- UDP: ~1ms localhost, no guaranteed delivery
- TCP: ~1-5ms localhost, reliable
- For sequencing: use Pd-internal timing, only send control changes via OSC
- Never try to do sample-accurate timing over OSC
SKILL_EOF

# =============================================================================
# SKILL 5: Pd Common Patterns
# =============================================================================
cat > "$SKILLS_DIR/pd-common-patterns.md" << 'SKILL_EOF'
# Skill: Common Pure Data Patch Patterns

## Purpose
Reusable Pd patch patterns for generating common structures programmatically.

## Pattern: Simple Sequencer
```
[metro <ms>]
|
[float] ---[+ 1]
|           |
[mod <steps>]
|
[select 0 1 2 3 ...]  <- one outlet per step
```

## Pattern: MIDI Note with Duration
```
[pack 0 0]         <- note, velocity
|        \
[noteout 1] [delay <ms>]
             |
             [pack 0 0]  <- same note, velocity 0
             |
             [noteout 1]
```

## Pattern: BPM to ms
```
[float <bpm>]
|
[/ 60]        <- beats per second
|
[* 1000]      <- ms per beat
|
[/ <subdivision>]  <- e.g. 4 for 16th notes
```
Formula: `ms = 60000 / (bpm * subdivision)`

## Pattern: Scale Quantizer
```
[mod 12]              <- get note class
|
[select 0 2 4 5 7 9 11]  <- C major intervals
|
[+ <octave_offset>]
```

## Pattern: Random Melody Generator
```
[metro 250]
|
[random 12]        <- random semitone
|
[+ 48]             <- base octave (C3)
|
[pack $1 100]      <- add velocity
|
[noteout 1]
```

## Pattern: Velocity Curves
```
[/ 127]           <- normalize to 0-1
|
[pow 0.5]         <- sqrt = expand low velocities
|                    [pow 2] = compress low velocities
[* 127]           <- back to MIDI range
```

## Pattern: LFO to CC
```
[osc~ <rate_hz>]      <- NOT audio osc, use [phasor~] for non-audio
|
[snapshot~ 50]         <- sample 50ms
|
[* 63.5]
[+ 63.5]              <- scale to 0-127
|
[ctlout <cc#> <ch>]
```

## Pattern: Channel Filter
```
[notein]
|       |      |
[float] [float] [float]
|       |       |
[pack 0 0 0]
|
[route <channel>]     <- actually use [select] on 3rd outlet of notein
```

Better channel filter:
```
[notein]
|  |  |
|  |  [select <ch>]
|  |  |
[stripnote]
|  |
[noteout <ch>]
```

## Pattern: Subpatch as Abstraction
File `voice.pd`:
```
#N canvas 0 50 450 300 12;
#X obj 50 50 inlet;     <- $1 = note
#X obj 50 100 mtof;
#X obj 50 150 osc~;
#X obj 50 200 *~ 0.1;
#X obj 50 250 outlet~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 2 0 3 0;
#X connect 3 0 4 0;
```
Usage in main patch: `[voice 60]`

## Layout Conventions (for generated patches)
- X spacing between objects: 100px
- Y spacing between rows: 40px
- Start position: x=50, y=50
- Connection cables: keep vertical when possible
- Group related objects visually
- Add comments (#X text x y content;) for documentation
SKILL_EOF

echo "✅ Skills created in $SKILLS_DIR/"
ls -la "$SKILLS_DIR/"
echo ""
echo "Skills:"
for f in "$SKILLS_DIR"/*.md; do
  echo "  - $(basename "$f")"
done
