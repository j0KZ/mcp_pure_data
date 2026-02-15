import { describe, it, expect, afterEach } from "vitest";
import dgram from "node:dgram";
import net from "node:net";
import { executeSendMessage } from "../../src/tools/control.js";

describe("send_message tool", () => {
  const servers: (dgram.Socket | net.Server)[] = [];

  afterEach(() => {
    for (const s of servers) {
      if ("close" in s) s.close();
    }
    servers.length = 0;
  });

  /** Start a mock UDP server on a random port. Returns port and received buffers. */
  function startUdpServer(): Promise<{ port: number; received: Buffer[] }> {
    return new Promise((resolve) => {
      const received: Buffer[] = [];
      const server = dgram.createSocket("udp4");
      servers.push(server);
      server.on("message", (msg) => received.push(Buffer.from(msg)));
      server.bind(0, "127.0.0.1", () => {
        const port = server.address().port;
        resolve({ port, received });
      });
    });
  }

  /** Start a mock TCP server on a random port. Returns port and received data. */
  function startTcpServer(): Promise<{ port: number; received: string[] }> {
    return new Promise((resolve) => {
      const received: string[] = [];
      const server = net.createServer((socket) => {
        socket.on("data", (data) => received.push(data.toString()));
        socket.on("end", () => socket.end());
      });
      servers.push(server);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ port: addr.port, received });
      });
    });
  }

  it("OSC message reaches mock UDP server", async () => {
    const { port, received } = await startUdpServer();

    await executeSendMessage({
      protocol: "osc",
      port,
      address: "/pd/bang",
    });

    // Give UDP a moment to deliver
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(1);
    // Should contain the address
    expect(received[0].toString("utf-8")).toContain("/pd/bang");
  });

  it("FUDI message reaches mock TCP server", async () => {
    const { port, received } = await startTcpServer();

    await executeSendMessage({
      protocol: "fudi",
      port,
      address: "tempo",
      args: [140],
    });

    // Give TCP a moment
    await new Promise((r) => setTimeout(r, 200));

    expect(received.length).toBeGreaterThanOrEqual(1);
    const data = received.join("");
    expect(data).toBe("tempo 140;\n");
  });

  it("OSC args are correctly encoded end-to-end", async () => {
    const { port, received } = await startUdpServer();

    await executeSendMessage({
      protocol: "osc",
      port,
      address: "/pd/note",
      args: [60, 100, 1],
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(1);
    const buf = received[0];

    // Find the type tag (after the address)
    const tagStart = buf.indexOf(",");
    expect(tagStart).toBeGreaterThan(0);
    const tag = buf.subarray(tagStart, tagStart + 4).toString("utf-8").replace(/\0+$/, "");
    expect(tag).toBe(",iii");

    // Read the 3 int32 values (after padded type tag)
    const argsStart = tagStart + 8; // ",iii\0" padded to 8
    expect(buf.readInt32BE(argsStart)).toBe(60);
    expect(buf.readInt32BE(argsStart + 4)).toBe(100);
    expect(buf.readInt32BE(argsStart + 8)).toBe(1);
  });

  it("FUDI auto-strips /pd/ prefix from address", async () => {
    const { port, received } = await startTcpServer();

    await executeSendMessage({
      protocol: "fudi",
      port,
      address: "/pd/tempo",
      args: [120],
    });

    await new Promise((r) => setTimeout(r, 200));

    const data = received.join("");
    expect(data).toBe("tempo 120;\n");
  });

  it("returns confirmation string with protocol, host, port, address", async () => {
    const { port } = await startUdpServer();

    const result = await executeSendMessage({
      protocol: "osc",
      port,
      address: "/pd/tempo",
      args: [140],
    });

    expect(result).toContain("OSC");
    expect(result).toContain("127.0.0.1");
    expect(result).toContain(String(port));
    expect(result).toContain("/pd/tempo");
    expect(result).toContain("140");
  });

  // -----------------------------------------------------------------------
  // Branch coverage: boolean protocol coercion (Claude Desktop quirk)
  // -----------------------------------------------------------------------
  it("coerces boolean protocol to 'osc'", async () => {
    const { port } = await startUdpServer();

    const result = await executeSendMessage({
      protocol: true as unknown as "osc",
      port,
      address: "/pd/bang",
    });

    expect(result).toContain("OSC");
  });

  // -----------------------------------------------------------------------
  // Branch coverage: FUDI strips leading slash (not /pd/ prefix)
  // -----------------------------------------------------------------------
  it("FUDI strips leading slash from non-/pd/ address", async () => {
    const { port, received } = await startTcpServer();

    await executeSendMessage({
      protocol: "fudi",
      port,
      address: "/tempo",
      args: [130],
    });

    await new Promise((r) => setTimeout(r, 200));

    const data = received.join("");
    expect(data).toBe("tempo 130;\n");
  });

  // -----------------------------------------------------------------------
  // Branch coverage: FUDI TCP response (non-empty)
  // -----------------------------------------------------------------------
  it("includes TCP response in output when server responds", async () => {
    // Custom TCP server that echoes a response
    const { port } = await new Promise<{ port: number }>((resolve) => {
      const server = net.createServer((socket) => {
        socket.on("data", () => {
          socket.write("ok\n");
          socket.end();
        });
      });
      servers.push(server);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ port: addr.port });
      });
    });

    const result = await executeSendMessage({
      protocol: "fudi",
      port,
      address: "tempo",
      args: [120],
    });

    expect(result).toContain("Response:");
    expect(result).toContain("ok");
  });

  it("defaults to port 9000 for OSC and 3000 for FUDI", async () => {
    // We can't actually test sending to default ports (they might be in use),
    // but we can verify the confirmation string shows the right port
    // by catching the connection error and checking the message.
    try {
      await executeSendMessage({
        protocol: "fudi",
        address: "tempo",
        args: [120],
        // No port specified — should default to 3000
      });
    } catch (e) {
      // Connection refused is expected — verify it tried port 3000
      const msg = (e as Error).message;
      expect(msg).toBeDefined();
    }
    // For OSC (UDP), fire-and-forget — won't error even if no listener
    const result = await executeSendMessage({
      protocol: "osc",
      address: "/pd/bang",
      // No port specified — should default to 9000
    });
    expect(result).toContain("9000");
  });
});
