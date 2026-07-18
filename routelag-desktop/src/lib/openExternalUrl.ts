import { invoke } from "@tauri-apps/api/core";

/**
 * Open an external URL via the Rust allowlist (`open_external_url`).
 * Falls back to window.open only outside Tauri (browser preview).
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await invoke("open_external_url", { url });
  } catch (error) {
    // Non-Tauri preview / allowlist rejection — never use unrestricted opener.
    if (typeof window !== "undefined" && !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    throw error;
  }
}
