import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { RouteLagHudLayout } from "../shared/hudTypes.js";
import { DEFAULT_COMPETITIVE_LAYOUT } from "../shared/defaultLayout.js";
import { isRouteLagHudLayout, sanitizeLayout } from "../shared/schemas.js";

export class LayoutStore {
  private layout = DEFAULT_COMPETITIVE_LAYOUT;

  load(): RouteLagHudLayout {
    try {
      const raw = readFileSync(this.layoutPath(), "utf8");
      const parsed = JSON.parse(raw);
      if (isRouteLagHudLayout(parsed)) {
        this.layout = sanitizeLayout(parsed);
      }
    } catch {
      this.layout = DEFAULT_COMPETITIVE_LAYOUT;
    }
    return this.layout;
  }

  get(): RouteLagHudLayout {
    return this.layout;
  }

  save(layout: RouteLagHudLayout): RouteLagHudLayout {
    this.layout = sanitizeLayout(layout);
    mkdirSync(this.dataDirectory(), { recursive: true });
    writeFileSync(this.layoutPath(), JSON.stringify(this.layout, null, 2), "utf8");
    return this.layout;
  }

  private dataDirectory(): string {
    return join(app.getPath("userData"), "state");
  }

  private layoutPath(): string {
    return join(this.dataDirectory(), "hud-layout.json");
  }
}
