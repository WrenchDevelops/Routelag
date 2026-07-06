import { app as electronApp } from "electron";
import type { overwolf } from "@overwolf/ow-electron";

export type OwApp = overwolf.OverwolfApp;

export function owApp(): OwApp {
  return electronApp as OwApp;
}
