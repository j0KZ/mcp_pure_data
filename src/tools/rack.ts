/**
 * create_rack tool implementation.
 *
 * Generates an entire Eurorack-style rack of Pd patches at once:
 * individual .pd files per module + a combined _rack.pd.
 * Supports inter-module wiring via throw~/catch~ and send/receive buses.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildPatch,
  type PatchSpec,
  type PatchNodeSpec,
  type PatchConnectionSpec,
} from "../core/serializer.js";
import { buildTemplate, buildTemplateWithPorts } from "../templates/index.js";
import type { PortInfo } from "../templates/port-info.js";
import { applyWiring, type WireSpec, type WiringModule } from "../wiring/bus-injector.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RackModuleSpec {
  template: string;
  params?: Record<string, unknown>;
  filename?: string;
  id?: string;
}

export interface CreateRackInput {
  modules: RackModuleSpec[];
  wiring?: WireSpec[];
  outputDir?: string;
}

// ---------------------------------------------------------------------------
// Table-name deduplication (Audit fix #1)
// ---------------------------------------------------------------------------

/** Pd objects that reference table names in their first argument. */
const TABLE_OBJECTS = new Set([
  "table",
  "tabread",
  "tabwrite",
  "tabread~",
  "tabwrite~",
  "tabread4~",
]);

/**
 * Scans a PatchSpec for table-related objects and appends `_${moduleIndex}`
 * to table names, preventing global name collisions in the combined patch.
 */
function deduplicateTableNames(
  spec: PatchSpec,
  moduleIndex: number,
): PatchSpec {
  // Collect all table names defined by this module
  const tableNames = new Set<string>();
  for (const node of spec.nodes) {
    if (node.name === "table" && node.args?.[0]) {
      tableNames.add(String(node.args[0]));
    }
  }
  if (tableNames.size === 0) return spec; // No tables, nothing to rename

  // Clone nodes and rename all references
  const newNodes = spec.nodes.map((node) => {
    if (node.name && TABLE_OBJECTS.has(node.name) && node.args?.[0]) {
      const name = String(node.args[0]);
      if (tableNames.has(name)) {
        const newArgs = [...node.args];
        newArgs[0] = `${name}_${moduleIndex}`;
        return { ...node, args: newArgs };
      }
    }
    return node;
  });

  return { ...spec, nodes: newNodes };
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/** Ensure filename ends with .pd (Audit fix #2). */
function ensurePdExtension(filename: string): string {
  return filename.endsWith(".pd") ? filename : `${filename}.pd`;
}

/** Generate a unique filename from a template name. */
function autoFilename(template: string, usedNames: Set<string>): string {
  let name = `${template}.pd`;
  let counter = 2;
  while (usedNames.has(name)) {
    name = `${template}-${counter}.pd`;
    counter++;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Combined patch builder
// ---------------------------------------------------------------------------

const COLUMN_WIDTH = 400;

function buildCombinedPatch(
  modules: { name: string; spec: PatchSpec; ports: PortInfo[]; id: string }[],
  wiring?: WireSpec[],
): string {
  const allNodes: PatchNodeSpec[] = [];
  const allConnections: PatchConnectionSpec[] = [];
  const wiringModules: WiringModule[] = [];

  // Rack title as node[0]
  allNodes.push({ type: "text", args: ["=== RACK ==="], x: 50, y: 10 });
  let nodeOffset = 1;

  for (let i = 0; i < modules.length; i++) {
    const { name, spec: rawSpec, ports, id } = modules[i];
    const xOffset = i * COLUMN_WIDTH;

    // Deduplicate table names for combined patch (Audit fix #1)
    const spec = deduplicateTableNames(rawSpec, i);

    // Section label
    allNodes.push({
      type: "text",
      args: [`=== ${name.toUpperCase()} ===`],
      x: 50 + xOffset,
      y: 30,
    });
    nodeOffset++;

    // Track module offset for wiring (section label counted above)
    wiringModules.push({ id, ports, nodeOffset });

    // Add nodes with X offset and local Y auto-layout
    // Nodes without explicit Y must be laid out based on their local index
    // within the module, NOT their global position in the combined array
    // (which would push later modules to extreme Y values).
    for (let j = 0; j < spec.nodes.length; j++) {
      const node = spec.nodes[j];
      allNodes.push({
        ...node,
        x: (node.x ?? 50) + xOffset,
        y: node.y ?? (50 + j * 40),
      });
    }

    // Add connections with index offset
    for (const conn of spec.connections) {
      allConnections.push({
        from: conn.from + nodeOffset,
        outlet: conn.outlet ?? 0,
        to: conn.to + nodeOffset,
        inlet: conn.inlet ?? 0,
      });
    }

    nodeOffset += spec.nodes.length;
  }

  // Apply inter-module wiring (adds throw~/catch~, send/receive nodes)
  if (wiring && wiring.length > 0) {
    applyWiring(allNodes, allConnections, wiringModules, wiring);
  }

  // title: undefined — we manually inserted our title as allNodes[0],
  // so buildPatch must NOT shift indices again.
  return buildPatch({ title: undefined, nodes: allNodes, connections: allConnections });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function executeCreateRack(
  input: CreateRackInput,
): Promise<string> {
  const { modules, wiring, outputDir } = input;
  const usedNames = new Set<string>();

  // Build all individual modules (with port metadata for wiring)
  const built: { filename: string; id: string; spec: PatchSpec; ports: PortInfo[]; pdText: string }[] = [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    let spec: PatchSpec;
    let ports: PortInfo[];
    try {
      if (wiring && wiring.length > 0) {
        // Need port metadata for wiring
        const rackable = buildTemplateWithPorts(mod.template, mod.params ?? {});
        spec = rackable.spec;
        ports = rackable.ports;
      } else {
        // No wiring — use standard buildTemplate (backward-compat)
        spec = buildTemplate(mod.template, mod.params ?? {});
        ports = [];
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Error in module ${i + 1} ("${mod.template}"): ${msg}`);
    }
    const pdText = buildPatch(spec);
    const filename = ensurePdExtension(
      mod.filename ?? autoFilename(mod.template, usedNames),
    );
    usedNames.add(filename);
    const id = mod.id ?? filename.replace(/\.pd$/, "");
    built.push({ filename, id, spec, ports, pdText });
  }

  // Build combined rack patch
  const combinedPd = buildCombinedPatch(
    built.map((b) => ({ name: b.filename.replace(/\.pd$/, ""), spec: b.spec, ports: b.ports, id: b.id })),
    wiring,
  );

  // Write files if outputDir provided
  if (outputDir) {
    const dir = resolve(outputDir);
    await mkdir(dir, { recursive: true });
    const writePromises = built.map((b) =>
      writeFile(join(dir, b.filename), b.pdText, "utf-8"),
    );
    writePromises.push(writeFile(join(dir, "_rack.pd"), combinedPd, "utf-8"));
    await Promise.all(writePromises);

    const fileList = built.map((b) => `  - ${b.filename}`).join("\n");
    const wiringInfo = wiring && wiring.length > 0
      ? `\nWiring: ${wiring.length} connection(s) applied to _rack.pd.\n`
      : "";
    return (
      `Rack generated successfully! ${built.length} modules + 1 combined patch.\n` +
      `Written to: ${dir}\n${wiringInfo}\n` +
      `Individual files:\n${fileList}\n  - _rack.pd (combined)\n\n` +
      `The combined _rack.pd content is below. Present it to the user — no additional file operations needed.\n\n` +
      `\`\`\`pd\n${combinedPd}\`\`\``
    );
  }

  // No outputDir — return all content inline
  const sections = built
    .map(
      (b) =>
        `--- ${b.filename} ---\n\`\`\`pd\n${b.pdText}\`\`\``,
    )
    .join("\n\n");

  const wiringInfo = wiring && wiring.length > 0
    ? `\nWiring: ${wiring.length} connection(s) applied to _rack.pd.\n`
    : "";

  return (
    `Rack generated successfully! ${built.length} modules + 1 combined patch.\n${wiringInfo}\n` +
    `Individual modules:\n\n${sections}\n\n` +
    `--- _rack.pd (combined) ---\n\`\`\`pd\n${combinedPd}\`\`\`\n\n` +
    `The user can save these as .pd files and open them in Pure Data.`
  );
}
