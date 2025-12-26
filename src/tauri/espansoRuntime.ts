import { Command } from "@tauri-apps/plugin-shell";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";

export interface InstallResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
}

export async function restartEspanso(): Promise<InstallResult> {
  try {
    const command = Command.create("espanso", ["restart"]);
    const output = await command.execute();

    if (output.code === 0) {
      return {
        success: true,
        message: "Successfully restarted Espanso.",
        stdout: output.stdout,
        stderr: output.stderr,
      };
    }

    return {
      success: false,
      message: `Espanso restart failed with exit code ${output.code}`,
      stdout: output.stdout,
      stderr: output.stderr,
    };
  } catch (cmdError: any) {
    return {
      success: false,
      message: `Auto-restart failed (is espanso CLI installed?): ${cmdError.message || cmdError}`,
    };
  }
}

export interface EspansoLogResult {
  success: boolean;
  log: string;
  message?: string;
}

export async function getEspansoLog(): Promise<EspansoLogResult> {
  // Direct log file reading (non-intrusive, zero process overhead, does not disturb Espanso daemon)
  try {
    const home = await homeDir();
    const userAgent = navigator.userAgent.toLowerCase();
    const isMac = userAgent.includes("mac") || userAgent.includes("osx");
    const isWindows = userAgent.includes("win");

    let logFilePath = "";
    if (isMac) {
      logFilePath = `${home}/Library/Caches/espanso/espanso.log`;
    } else if (isWindows) {
      logFilePath = `${home}/AppData/Local/espanso/espanso.log`;
    } else {
      logFilePath = `${home}/.cache/espanso/espanso.log`;
    }

    if (await exists(logFilePath)) {
      const content = await readTextFile(logFilePath);
      return {
        success: true,
        log: content,
      };
    }
  } catch (fileErr) {
    console.warn("Direct espanso.log file read failed, falling back to CLI:", fileErr);
  }

  // Fallback: Use CLI command ONLY if log file is unreadable directly
  try {
    const command = Command.create("espanso", ["log"]);
    const output = await command.execute();

    if (output.code === 0) {
      return {
        success: true,
        log: output.stdout,
      };
    }

    return {
      success: false,
      log: output.stdout || output.stderr || "",
      message: `Espanso log command exited with code ${output.code}`,
    };
  } catch (cmdError: any) {
    return {
      success: false,
      log: "",
      message: `Failed to fetch Espanso log: ${cmdError.message || cmdError}`,
    };
  }
}
