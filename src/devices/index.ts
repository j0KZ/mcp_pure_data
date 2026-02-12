/**
 * Device profile registry.
 */

import type { DeviceProfile } from "./types.js";
import { k2Profile } from "./k2.js";
import { microfreakProfile } from "./microfreak.js";
import { tr8sProfile } from "./tr8s.js";

const devices = new Map<string, DeviceProfile>([
  [k2Profile.name, k2Profile],
  ["k2", k2Profile], // alias
  [microfreakProfile.name, microfreakProfile],
  ["mf", microfreakProfile], // alias
  [tr8sProfile.name, tr8sProfile],
  ["tr8s", tr8sProfile], // alias
]);

/**
 * Look up a device profile by name.
 * Throws if the device name is not recognized.
 */
export function getDevice(name: string): DeviceProfile {
  const profile = devices.get(name.toLowerCase());
  if (!profile) {
    const available = [...new Set([...devices.values()].map((d) => d.name))];
    throw new Error(
      `Unknown device "${name}". Available devices: ${available.join(", ")}`,
    );
  }
  return profile;
}
