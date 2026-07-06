import { DEFAULT_BRIDGE_URL, LOCALHOST_NAMES } from "../shared/constants.js";

export interface CliOptions {
  bridgeUrl: string;
  token?: string;
  showVersion: boolean;
  shutdown: boolean;
  devDemo: boolean;
}

export function parseCli(argv = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    bridgeUrl: DEFAULT_BRIDGE_URL,
    showVersion: false,
    shutdown: false,
    devDemo: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bridge") {
      options.bridgeUrl = argv[i + 1] ?? DEFAULT_BRIDGE_URL;
      i += 1;
    } else if (arg === "--token") {
      options.token = argv[i + 1];
      i += 1;
    } else if (arg === "--version") {
      options.showVersion = true;
    } else if (arg === "--shutdown") {
      options.shutdown = true;
    } else if (arg === "--dev-demo") {
      options.devDemo = true;
    }
  }

  return options;
}

export function validateBridgeTarget(bridgeUrl: string): boolean {
  try {
    const url = new URL(bridgeUrl);
    return (
      url.protocol === "ws:" &&
      LOCALHOST_NAMES.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.pathname === "/hud" || url.pathname === "/hud/") &&
      (url.port === "" || url.port === "17389")
    );
  } catch {
    return false;
  }
}

export function bridgeUrlWithToken(bridgeUrl: string, token: string): string {
  const url = new URL(bridgeUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
