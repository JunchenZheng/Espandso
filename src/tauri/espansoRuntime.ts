import { Command } from "@tauri-apps/plugin-shell";

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
