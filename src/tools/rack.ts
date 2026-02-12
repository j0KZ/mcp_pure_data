/**
 * create_rack tool implementation.
 *
 * Generates an entire Eurorack-style rack of Pd patches at once:
 * individual .pd files per module + a combined _rack.pd.
 * Supports inter-module wiring via throw~/catch~ and send/receive buses.
 * Supports MIDI controller integration via ctlin → send/receive parameter buses.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildPatch,
  type PatchSpec,
  type PatchNodeSpec,
  type PatchConnectionSpec,
} from "../core/serializer.js";
import { buildTemplateWithPorts } from "../templates/index.js";
import type { PortInfo, ParameterDescriptor } from "../templates/port-info.js";
import { applyWiring, type WireSpec, type WiringModule } from "../wiring/bus-injector.js";
import { getDevice } from "../devices/index.js";
import { autoMap } from "../controllers/auto-mapper.js";
import { buildControllerPatch } from "../controllers/pd-controller.js";
import { buildOutputControllerPatch } from "../controllers/pd-output-controller.js";
import { injectParameterReceivers } from "../controllers/param-injector.js";
import { generateK2DeckConfig } from "../controllers/k2-deck-config.js";
import type { ControllerConfig, ControllerMapping, CustomMapping } from "../controllers/types.js";

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
  controller?: ControllerConfig;
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

interface CombinedModule {
  name: string;
  spec: PatchSpec;
  ports: PortInfo[];
  parameters?: ParameterDescriptor[];
  id: string;
}

function buildCombinedPatch(
  modules: CombinedModule[],
  wiring?: WireSpec[],
  controllerMappings?: ControllerMapping[],
): string {
  const allNodes: PatchNodeSpec[] = [];
  const allConnections: PatchConnectionSpec[] = [];
  const wiringModules: WiringModule[] = [];
  const paramModules: { id: string; parameters: ParameterDescriptor[]; nodeOffset: number }[] = [];

  // Rack title as node[0]
  allNodes.push({ type: "text", args: ["=== RACK ==="], x: 50, y: 10 });
  let nodeOffset = 1;

  for (let i = 0; i < modules.length; i++) {
    const { name, spec: rawSpec, ports, parameters, id } = modules[i];
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

    // Track module offset for parameter injection
    if (parameters && parameters.length > 0) {
      paramModules.push({ id, parameters, nodeOffset });
    }

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

  // Inject parameter receivers for controller integration
  if (controllerMappings && controllerMappings.length > 0) {
    injectParameterReceivers(allNodes, allConnections, paramModules, controllerMappings);
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
  const { modules, wiring, controller, outputDir } = input;
  const usedNames = new Set<string>();

  // Build all individual modules — always use buildTemplateWithPorts
  // for consistent behavior (ports + parameters needed for wiring/controller)
  const built: {
    filename: string;
    id: string;
    spec: PatchSpec;
    ports: PortInfo[];
    parameters: ParameterDescriptor[];
    pdText: string;
  }[] = [];

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    try {
      const rackable = buildTemplateWithPorts(mod.template, mod.params ?? {});
      const pdText = buildPatch(rackable.spec);
      const filename = ensurePdExtension(
        mod.filename ?? autoFilename(mod.template, usedNames),
      );
      usedNames.add(filename);
      const id = mod.id ?? filename.replace(/\.pd$/, "");
      built.push({
        filename,
        id,
        spec: rackable.spec,
        ports: rackable.ports,
        parameters: rackable.parameters ?? [],
        pdText,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Error in module ${i + 1} ("${mod.template}"): ${msg}`);
    }
  }

  // Resolve controller mappings (if controller configured)
  let controllerMappings: ControllerMapping[] | undefined;
  let outputMappings: ControllerMapping[] | undefined;
  let controllerPd: string | undefined;
  let outputControllerPd: string | undefined;
  let k2ConfigJson: string | undefined;
  let controllerWarning = "";
  let setupNotesText = "";

  if (controller) {
    const device = getDevice(controller.device);
    const midiChannel = controller.midiChannel ?? device.midiChannel;

    // Include device setup notes in response
    if (device.setupNotes && device.setupNotes.length > 0) {
      setupNotesText =
        `\n${device.label} setup required:\n` +
        device.setupNotes.map((n) => `  * ${n}`).join("\n") +
        "\n";
    }

    // Collect modules with parameters
    const mappableModules = built
      .filter((b) => b.parameters.length > 0)
      .map((b) => ({ id: b.id, parameters: b.parameters }));

    if (mappableModules.length === 0) {
      controllerWarning =
        "\nController: No controllable parameters found in rack modules. " +
        "Add synth, mixer, or drum-machine for controller support.\n";
    } else {
      // Check if device has input controls (hardware → Pd)
      const hasInputControls = device.controls.some(
        (c) => (c.direction ?? "input") === "input" || c.direction === "bidirectional",
      );

      // Check if device has output controls (Pd → hardware)
      const hasOutputControls = device.controls.some(
        (c) => c.direction === "output" || c.direction === "bidirectional",
      );

      // Generate input controller (_controller.pd) for input-direction controls
      if (hasInputControls) {
        controllerMappings = autoMap(
          mappableModules,
          device,
          controller.mappings as CustomMapping[] | undefined,
          "input",
        );

        if (controllerMappings.length > 0) {
          const controllerSpec = buildControllerPatch(controllerMappings, midiChannel);
          controllerPd = buildPatch(controllerSpec);

          // Generate K2 Deck config only for K2 device
          if (device.name === "xone-k2") {
            const k2Config = generateK2DeckConfig(controllerMappings, midiChannel);
            k2ConfigJson = JSON.stringify(k2Config, null, 2);
          }
        }
      }

      // Generate output controller (_output_controller.pd) for output-direction controls
      if (hasOutputControls) {
        outputMappings = autoMap(
          mappableModules,
          device,
          controller.mappings as CustomMapping[] | undefined,
          "output",
        );

        if (outputMappings.length > 0) {
          const outputSpec = buildOutputControllerPatch(outputMappings, midiChannel, device.label);
          outputControllerPd = buildPatch(outputSpec);
        }
      }
    }
  }

  // Build combined rack patch (with controller mappings if present)
  const combinedPd = buildCombinedPatch(
    built.map((b) => ({
      name: b.filename.replace(/\.pd$/, ""),
      spec: b.spec,
      ports: b.ports,
      parameters: b.parameters,
      id: b.id,
    })),
    wiring,
    controllerMappings,
  );

  // Format controller mapping summary
  let controllerInfo = controllerWarning + setupNotesText;
  if (controllerMappings && controllerMappings.length > 0) {
    const lines = controllerMappings.map(
      (m) => `  ${m.control.name} (CC${m.control.cc}) → ${m.moduleId}.${m.parameter.name}`,
    );
    controllerInfo +=
      `\nInput controller: ${controllerMappings.length} mapping(s):\n${lines.join("\n")}\n`;
  }
  if (outputMappings && outputMappings.length > 0) {
    const lines = outputMappings.map(
      (m) => `  ${m.moduleId}.${m.parameter.name} → CC${m.control.cc} (${m.control.name})`,
    );
    controllerInfo +=
      `\nOutput controller: ${outputMappings.length} mapping(s):\n${lines.join("\n")}\n`;
  }

  // Write files if outputDir provided
  if (outputDir) {
    const dir = resolve(outputDir);
    await mkdir(dir, { recursive: true });
    const writePromises = built.map((b) =>
      writeFile(join(dir, b.filename), b.pdText, "utf-8"),
    );
    writePromises.push(writeFile(join(dir, "_rack.pd"), combinedPd, "utf-8"));
    if (controllerPd) {
      writePromises.push(writeFile(join(dir, "_controller.pd"), controllerPd, "utf-8"));
    }
    if (k2ConfigJson) {
      writePromises.push(writeFile(join(dir, "_k2_config.json"), k2ConfigJson, "utf-8"));
    }
    if (outputControllerPd) {
      writePromises.push(writeFile(join(dir, "_output_controller.pd"), outputControllerPd, "utf-8"));
    }
    await Promise.all(writePromises);

    const fileList = built.map((b) => `  - ${b.filename}`).join("\n");
    const wiringInfo = wiring && wiring.length > 0
      ? `\nWiring: ${wiring.length} connection(s) applied to _rack.pd.\n`
      : "";
    const extraFiles = [
      "  - _rack.pd (combined)",
      controllerPd ? "  - _controller.pd (MIDI input controller)" : "",
      outputControllerPd ? "  - _output_controller.pd (MIDI output controller)" : "",
      k2ConfigJson ? "  - _k2_config.json (K2 Deck config)" : "",
    ].filter(Boolean).join("\n");

    return (
      `Rack generated successfully! ${built.length} modules + 1 combined patch.\n` +
      `Written to: ${dir}\n${wiringInfo}${controllerInfo}\n` +
      `Individual files:\n${fileList}\n${extraFiles}\n\n` +
      `ALL FILES WRITTEN SUCCESSFULLY. Do NOT run bash, ls, mkdir, cat, or any file operations to verify — files are already on disk.\n\n` +
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

  let controllerSection = "";
  if (controllerPd) {
    controllerSection += `\n\n--- _controller.pd ---\n\`\`\`pd\n${controllerPd}\`\`\``;
  }
  if (outputControllerPd) {
    controllerSection += `\n\n--- _output_controller.pd ---\n\`\`\`pd\n${outputControllerPd}\`\`\``;
  }

  return (
    `Rack generated successfully! ${built.length} modules + 1 combined patch.\n${wiringInfo}${controllerInfo}\n` +
    `Individual modules:\n\n${sections}\n\n` +
    `--- _rack.pd (combined) ---\n\`\`\`pd\n${combinedPd}\`\`\`${controllerSection}\n\n` +
    `ALL CONTENT IS ABOVE. Do NOT run bash, ls, mkdir, cat, or any file operations. ` +
    `Simply present the .pd content to the user as-is.`
  );
}
