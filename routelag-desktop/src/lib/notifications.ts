import { useCallback, useEffect, useState } from "react";

import type { MiniView } from "../App";
import { HUD_ENABLED, REPLAY_ENABLED } from "./featureFlags";

export type NotificationKind = "replay" | "routing" | "hud" | "account" | "update";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  href: MiniView;
}

const STORAGE_KEY = "routelag.notifications.v1";
const SEED_KEY = "routelag.notifications.seeded.v1";
const CHANGE_EVENT = "routelag:notifications";
const MAX_ITEMS = 40;

type NotificationInput = Omit<AppNotification, "id" | "createdAt" | "read"> & {
  id?: string;
  createdAt?: number;
  read?: boolean;
};

function emitChange() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function readStore(): AppNotification[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } catch {
    return [];
  }
}

function writeStore(items: AppNotification[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  emitChange();
}

export function loadNotifications(): AppNotification[] {
  return readStore();
}

export function unreadNotificationCount(items: AppNotification[] = readStore()) {
  return items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}

export function pushNotification(input: NotificationInput) {
  const items = readStore();
  const id = input.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (items.some((item) => item.id === id)) return items;
  const next: AppNotification = {
    id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    createdAt: input.createdAt ?? Date.now(),
    read: input.read ?? false,
  };
  const merged = [next, ...items].slice(0, MAX_ITEMS);
  writeStore(merged);
  return merged;
}

export function markNotificationRead(id: string) {
  const items = readStore().map((item) => (item.id === id ? { ...item, read: true } : item));
  writeStore(items);
  return items;
}

export function markAllNotificationsRead() {
  const items = readStore().map((item) => (item.read ? item : { ...item, read: true }));
  writeStore(items);
  return items;
}

export function formatNotificationAge(createdAt: number, now = Date.now()) {
  const deltaMs = Math.max(0, now - createdAt);
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** One-time starter notices so the bell isn't empty on first launch. */
export function ensureSeedNotifications() {
  if (window.localStorage.getItem(SEED_KEY) === "1") return;
  const now = Date.now();
  const seeds: NotificationInput[] = [
    ...(REPLAY_ENABLED
      ? [
          {
            id: "seed-replay-ready",
            kind: "replay" as const,
            title: "Replay ready",
            body: "Your latest match has been processed.",
            href: "replays" as MiniView,
            createdAt: now - 2 * 60_000,
            read: false,
          },
        ]
      : []),
    {
      id: "seed-route-switched",
      kind: "routing",
      title: "Route switched",
      body: "Dallas was selected for lower latency.",
      href: "routes",
      createdAt: now - 18 * 60_000,
      read: false,
    },
    ...(HUD_ENABLED
      ? [
          {
            id: "seed-hud-update",
            kind: "update" as const,
            title: "Overlay update available",
            body: "Restart Zer0 to install the latest HUD runtime.",
            href: "hud" as MiniView,
            createdAt: now - 24 * 60 * 60_000,
            read: true,
          },
        ]
      : [
          {
            id: "seed-app-update",
            kind: "update" as const,
            title: "App update available",
            body: "Restart Zer0 to install routing improvements.",
            href: "settings" as MiniView,
            createdAt: now - 24 * 60 * 60_000,
            read: true,
          },
        ]),
  ];

  const existing = readStore();
  const merged = [...seeds, ...existing]
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      ...item,
      read: item.read ?? false,
      createdAt: item.createdAt ?? now,
      id: item.id ?? `seed-${Math.random().toString(36).slice(2, 8)}`,
    }));

  writeStore(merged as AppNotification[]);
  window.localStorage.setItem(SEED_KEY, "1");
}

export function useAppNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    ensureSeedNotifications();
    return loadNotifications();
  });

  useEffect(() => {
    const refresh = () => setNotifications(loadNotifications());
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(markNotificationRead(id));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(markAllNotificationsRead());
  }, []);

  const push = useCallback((input: NotificationInput) => {
    setNotifications(pushNotification(input));
  }, []);

  return {
    notifications,
    unreadCount: unreadNotificationCount(notifications),
    markRead,
    markAllRead,
    push,
  };
}
