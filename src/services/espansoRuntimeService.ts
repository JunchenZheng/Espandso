import { restartEspanso as tauriRestartEspanso, getEspansoLog as tauriGetEspansoLog } from "../tauri/espansoRuntime";
import type { InstallResult, EspansoLogResult } from "../tauri/espansoRuntime";

/**
 * Service to manage Espanso CLI runtime actions.
 * Abstracted from low-level Tauri commands so it doesn't leak raw invoke/command models.
 */

export async function restartEspanso(): Promise<InstallResult> {
  return await tauriRestartEspanso();
}

export async function getEspansoLog(): Promise<EspansoLogResult> {
  return await tauriGetEspansoLog();
}
