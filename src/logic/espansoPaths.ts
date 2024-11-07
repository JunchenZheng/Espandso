import { homeDir } from "@tauri-apps/api/path";

export async function getEspansoMatchDir(): Promise<string> {
  const home = await homeDir();
  const userAgent = navigator.userAgent.toLowerCase();
  
  const isMac = userAgent.includes("mac") || userAgent.includes("osx");
  const isWindows = userAgent.includes("win");

  if (isMac) {
    return `${home}/Library/Application Support/espanso/match`;
  } else if (isWindows) {
    return `${home}/AppData/Roaming/espanso/match`;
  } else {
    // Default Linux
    return `${home}/.config/espanso/match`;
  }
}
