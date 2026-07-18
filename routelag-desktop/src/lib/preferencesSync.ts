/** Bumped on every local preference save so in-flight cloud pulls can't clobber a fresher choice. */
let preferencesSyncGeneration = 0;

export function bumpPreferencesSyncGeneration() {
  preferencesSyncGeneration += 1;
  return preferencesSyncGeneration;
}

export function getPreferencesSyncGeneration() {
  return preferencesSyncGeneration;
}
