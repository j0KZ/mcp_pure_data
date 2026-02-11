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
