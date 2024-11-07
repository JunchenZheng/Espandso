import { copyFile, exists, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { getEspansoMatchDir } from "../logic/espansoPaths";

export interface InstallResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
}

/**
 * Installs the generated YAML into the local Espanso match directory,
 * backs up the existing file if it exists, and restarts Espanso.
 * @param yamlContent The generated YAML string
 * @param relativePath Relative file path (e.g. "base.yml")
 */
export async function installAndRestart(
  yamlContent: string,
  relativePath: string = "base.yml"
): Promise<InstallResult> {
  try {
    const matchDir = await getEspansoMatchDir();

    // Separate relativePath to handle nested sub-directories if any
    const pathParts = relativePath.split("/");
    const fileName = pathParts.pop() || "base.yml";
    
    let currentDir = matchDir;
    if (pathParts.length > 0) {
      currentDir = `${matchDir}/${pathParts.join("/")}`;
      const dirExists = await exists(currentDir);
      if (!dirExists) {
        await mkdir(currentDir, { recursive: true });
      }
    } else {
      const matchDirExists = await exists(matchDir);
      if (!matchDirExists) {
        await mkdir(matchDir, { recursive: true });
      }
    }

    const targetPath = `${currentDir}/${fileName}`;
    const backupPath = `${targetPath}.backup`;

    // 1. Backup if file exists
    const fileExists = await exists(targetPath);
    if (fileExists) {
      try {
        await copyFile(targetPath, backupPath);
      } catch (backupError) {
        console.warn(`Could not create backup for ${targetPath}:`, backupError);
      }
    }

    // 2. Write YAML
    await writeTextFile(targetPath, yamlContent);

    // 3. Restart Espanso via Command
    try {
      const command = Command.create("espanso", ["restart"]);
      const output = await command.execute();

      if (output.code === 0) {
        return {
          success: true,
          message: `Successfully installed to Espanso and restarted!`,
          stdout: output.stdout,
          stderr: output.stderr,
        };
      } else {
        return {
          success: false,
          message: `Installed, but Espanso restart failed with exit code ${output.code}`,
          stdout: output.stdout,
          stderr: output.stderr,
        };
      }
    } catch (cmdError: any) {
      return {
        success: true, // Config written successfully, restart failed
        message: `Installed, but auto-restart failed (is espanso CLI installed?): ${cmdError.message || cmdError}`,
      };
    }
  } catch (e: any) {
    return {
      success: false,
      message: `Failed to install Espanso snippets: ${e.message || e}`,
    };
  }
}
