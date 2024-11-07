import { load, Store } from "@tauri-apps/plugin-store";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("settings.bin");
  }
  return storePromise;
}

export async function setSetting(key: string, value: any): Promise<void> {
  try {
    const s = await getStore();
    await s.set(key, value);
    await s.save();
  } catch (e) {
    console.error("Failed to save setting:", e);
  }
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const s = await getStore();
    const val = await s.get<T>(key);
    return val !== undefined && val !== null ? val : defaultValue;
  } catch (e) {
    console.error("Failed to load setting:", e);
    return defaultValue;
  }
}
