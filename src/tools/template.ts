/**
 * create_from_template tool implementation.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildPatch } from "../core/serializer.js";
import { buildTemplate, TEMPLATE_NAMES } from "../templates/index.js";

export interface CreateFromTemplateInput {
  template: string;
  params?: Record<string, unknown>;
  outputPath?: string;
}

export async function executeCreateFromTemplate(
  input: CreateFromTemplateInput,
): Promise<string> {
  const { template: name, params = {}, outputPath } = input;

  // Build the PatchSpec from the template
  const spec = buildTemplate(name, params);

  // Serialize to .pd text
  const pdText = buildPatch(spec);

  // Optionally write to file
  if (outputPath) {
    const resolved = resolve(outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, pdText, "utf-8");
    return (
      `Template "${name}" generated successfully.\n` +
      `Written to: ${resolved}\n\n` +
      `The complete .pd content is below. Present it to the user — no additional file operations needed.\n\n` +
      `\`\`\`pd\n${pdText}\`\`\``
    );
  }

  return (
    `Template "${name}" generated successfully.\n\n` +
    `The complete .pd content is below. Present it to the user — no additional file operations needed.\n` +
    `The user can save this content as a .pd file and open it in Pure Data.\n\n` +
    `\`\`\`pd\n${pdText}\`\`\``
  );
}
