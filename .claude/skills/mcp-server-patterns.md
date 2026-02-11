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
