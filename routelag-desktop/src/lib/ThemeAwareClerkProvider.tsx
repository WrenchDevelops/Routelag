import { ClerkProvider } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";

import { loadAppPreferences, type AppTheme } from "./appPreferences";
import { getClerkAppearance } from "./clerkAppearance";

/** Keeps ClerkProvider appearance in sync with Zer0 light/dark theme. */
export function ThemeAwareClerkProvider({
  children,
  publishableKey,
  afterSignOutUrl,
}: {
  children: ReactNode;
  publishableKey: string;
  afterSignOutUrl: string;
}) {
  const [theme, setTheme] = useState<AppTheme>(() => loadAppPreferences().theme);

  useEffect(() => {
    const sync = () => setTheme(loadAppPreferences().theme);
    window.addEventListener("routelag:preferences", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("routelag:preferences", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={afterSignOutUrl}
      appearance={getClerkAppearance(theme)}
    >
      {children}
    </ClerkProvider>
  );
}
