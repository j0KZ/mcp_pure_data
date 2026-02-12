/**
 * Auto-mapping algorithm: assigns device controls to rack parameters.
 *
 * Strategy:
 *   1. Custom mappings applied first (override everything)
 *   2. Absolute controls (faders/pots):
 *      a. Faders (category "amplitude") → amplitude parameters
 *      b. Pots row 1 (category "frequency") → filter parameters
 *      c. Remaining absolute → remaining continuous parameters (round-robin)
 *   3. Relative controls (encoders) → remaining continuous parameters
 *   4. Trigger controls (buttons) → transport/toggle parameters
 *
 * Supports direction filtering:
 *   - "input" (default): maps hardware→Pd controls (ctlin)
 *   - "output": maps Pd→hardware controls (ctlout)
 *   - Bidirectional controls match either direction.
 */

import type { DeviceProfile, DeviceControl } from "../devices/types.js";
import type { ParameterDescriptor } from "../templates/port-info.js";
import type { ControllerMapping, CustomMapping } from "./types.js";

/** Module with its parameters for mapping. */
export interface MappableModule {
  id: string;
  parameters: ParameterDescriptor[];
}

/** Generate the bus name for a parameter mapping. */
function busName(moduleId: string, paramName: string): string {
  return `${moduleId}__p__${paramName}`;
}

/**
 * Check if a control matches a target direction.
 * Controls without explicit direction default to "input".
 */
function controlMatchesDirection(
  control: DeviceControl,
  targetDirection: "input" | "output",
): boolean {
  const dir = control.direction ?? "input";
  return dir === targetDirection || dir === "bidirectional";
}

/**
 * Validate custom mappings against available controls and parameters.
 * Throws descriptive errors on invalid references.
 */
function validateCustomMappings(
  customMappings: CustomMapping[],
  device: DeviceProfile,
  modules: MappableModule[],
): void {
  const controlNames = new Set(device.controls.map((c) => c.name));
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const usedControls = new Set<string>();

  for (const cm of customMappings) {
    // Validate control name
    if (!controlNames.has(cm.control)) {
      throw new Error(
        `Controller mapping error: control "${cm.control}" not found on device "${device.name}". ` +
          `Available controls: ${[...controlNames].join(", ")}`,
      );
    }

    // Validate module ID
    const mod = moduleMap.get(cm.module);
    if (!mod) {
      throw new Error(
        `Controller mapping error: module "${cm.module}" not found. ` +
          `Available modules: ${modules.map((m) => m.id).join(", ")}`,
      );
    }

    // Validate parameter name
    const param = mod.parameters.find((p) => p.name === cm.parameter);
    if (!param) {
      const available = mod.parameters.map((p) => p.name);
      throw new Error(
        `Controller mapping error: parameter "${cm.parameter}" not found on module "${cm.module}". ` +
          `Available parameters: ${available.join(", ") || "(none)"}`,
      );
    }

    // Check duplicate control assignment
    if (usedControls.has(cm.control)) {
      throw new Error(
        `Controller mapping error: control "${cm.control}" is already mapped.`,
      );
    }
    usedControls.add(cm.control);
  }
}

/** Helper to push a mapping result and mark control/param as used. */
function addMapping(
  results: ControllerMapping[],
  usedControls: Set<string>,
  usedParams: Set<string>,
  control: DeviceControl,
  moduleId: string,
  param: ParameterDescriptor,
): void {
  results.push({
    control,
    moduleId,
    parameter: param,
    busName: busName(moduleId, param.name),
  });
  usedControls.add(control.name);
  usedParams.add(`${moduleId}::${param.name}`);
}

/**
 * Auto-map device controls to rack parameters.
 *
 * @param direction - "input" for hardware→Pd (ctlin), "output" for Pd→hardware (ctlout).
 *   Default: "input" for backwards compatibility.
 *
 * Returns mappings sorted by control order on the device.
 * Unmapped controls/parameters are silently skipped.
 */
export function autoMap(
  modules: MappableModule[],
  device: DeviceProfile,
  customMappings?: CustomMapping[],
  direction: "input" | "output" = "input",
): ControllerMapping[] {
  // Validate custom mappings first
  if (customMappings && customMappings.length > 0) {
    validateCustomMappings(customMappings, device, modules);
  }

  // Build flat list of all parameters with module context
  const allParams: { moduleId: string; param: ParameterDescriptor }[] = [];
  for (const mod of modules) {
    for (const param of mod.parameters) {
      allParams.push({ moduleId: mod.id, param });
    }
  }

  if (allParams.length === 0) return [];

  const results: ControllerMapping[] = [];
  const usedControls = new Set<string>();
  const usedParams = new Set<string>(); // "moduleId::paramName"

  // ── Phase 1: Apply custom mappings ──────────────────────────────────
  if (customMappings) {
    for (const cm of customMappings) {
      const control = device.controls.find((c) => c.name === cm.control)!;
      const mod = modules.find((m) => m.id === cm.module)!;
      const param = mod.parameters.find((p) => p.name === cm.parameter)!;

      addMapping(results, usedControls, usedParams, control, cm.module, param);
    }
  }

  // ── Phase 2: Auto-map absolute controls by category ─────────────────
  const categoryPriority: Record<string, number> = {
    amplitude: 0,
    filter: 1,
    oscillator: 2,
    effect: 3,
    transport: 4,
  };

  // Get continuous params sorted by priority (for absolute + relative controls)
  const getContinuousParams = () =>
    allParams
      .filter((p) => !usedParams.has(`${p.moduleId}::${p.param.name}`))
      .filter((p) => (p.param.controlType ?? "continuous") === "continuous")
      .sort((a, b) => (categoryPriority[a.param.category] ?? 9) - (categoryPriority[b.param.category] ?? 9));

  // Get unused absolute controls that match direction
  const absoluteControls = device.controls.filter(
    (c) => !usedControls.has(c.name) && c.inputType === "absolute" && controlMatchesDirection(c, direction),
  );

  // Group absolute controls by category
  const amplitudeControls = absoluteControls.filter((c) => c.category === "amplitude");
  const frequencyControls = absoluteControls.filter((c) => c.category === "frequency");
  const generalAbsControls = absoluteControls.filter((c) => c.category === "general");

  // Match amplitude controls → amplitude params
  const amplitudeParams = getContinuousParams().filter((p) => p.param.category === "amplitude");
  for (let i = 0; i < Math.min(amplitudeControls.length, amplitudeParams.length); i++) {
    const { moduleId, param } = amplitudeParams[i];
    addMapping(results, usedControls, usedParams, amplitudeControls[i], moduleId, param);
  }

  // Match frequency controls → filter params
  const filterParams = getContinuousParams().filter((p) => p.param.category === "filter");
  for (let i = 0; i < Math.min(frequencyControls.length, filterParams.length); i++) {
    const { moduleId, param } = filterParams[i];
    addMapping(results, usedControls, usedParams, frequencyControls[i], moduleId, param);
  }

  // Remaining absolute controls → remaining continuous params (round-robin)
  const unusedAbsolute = [
    ...amplitudeControls.filter((c) => !usedControls.has(c.name)),
    ...frequencyControls.filter((c) => !usedControls.has(c.name)),
    ...generalAbsControls.filter((c) => !usedControls.has(c.name)),
  ];

  let continuousRemaining = getContinuousParams();
  for (let i = 0; i < Math.min(unusedAbsolute.length, continuousRemaining.length); i++) {
    const { moduleId, param } = continuousRemaining[i];
    addMapping(results, usedControls, usedParams, unusedAbsolute[i], moduleId, param);
  }

  // ── Phase 3: Auto-map relative controls (encoders) ──────────────────
  const relativeControls = device.controls.filter(
    (c) => !usedControls.has(c.name) && c.inputType === "relative" && controlMatchesDirection(c, direction),
  );

  if (relativeControls.length > 0) {
    continuousRemaining = getContinuousParams();
    for (let i = 0; i < Math.min(relativeControls.length, continuousRemaining.length); i++) {
      const { moduleId, param } = continuousRemaining[i];
      addMapping(results, usedControls, usedParams, relativeControls[i], moduleId, param);
    }
  }

  // ── Phase 4: Auto-map trigger controls (buttons) ────────────────────
  const triggerControls = device.controls.filter(
    (c) => !usedControls.has(c.name) && c.inputType === "trigger" && controlMatchesDirection(c, direction),
  );

  if (triggerControls.length > 0) {
    // Buttons go to transport/toggle params first, then any remaining
    const triggerParams = allParams
      .filter((p) => !usedParams.has(`${p.moduleId}::${p.param.name}`))
      .filter((p) => {
        const ct = p.param.controlType ?? "continuous";
        return ct === "trigger" || ct === "toggle";
      });

    for (let i = 0; i < Math.min(triggerControls.length, triggerParams.length); i++) {
      const { moduleId, param } = triggerParams[i];
      addMapping(results, usedControls, usedParams, triggerControls[i], moduleId, param);
    }
  }

  return results;
}
