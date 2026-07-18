import { Show, useClerk, useUser } from "@clerk/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bell, ChevronDown, Minus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import type { MiniView } from "../App";
import { api } from "../api";
import { clearRouteAuth } from "../lib/api";
import { useEntitlements } from "../lib/billing";
import { HUD_ENABLED, REPLAY_ENABLED } from "../lib/featureFlags";
import {
  formatNotificationAge,
  useAppNotifications,
  type AppNotification,
} from "../lib/notifications";

export interface SessionStripProps {
  connected: boolean;
  connecting?: boolean;
  actionBusy?: boolean;
  routeCity: string | null;
  regionLabel: string | null;
  pingMs: number | null;
  hudOn?: boolean;
  replayCaptureOn?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenHud?: () => void;
  onOpenReplays?: () => void;
}

interface DragHeaderProps {
  currentView?: MiniView;
  onNavigate?: (view: MiniView) => void;
  sessionStrip?: SessionStripProps | null;
}

function stopWindowDrag(event: PointerEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function formatRegion(label: string) {
  return label.replace(/-/g, " ");
}

export function DragHeader({ onNavigate, sessionStrip }: DragHeaderProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { hasProPlan, isLoaded: entitlementsLoaded } = useEntitlements();
  const { notifications, unreadCount, markRead, markAllRead } = useAppNotifications();
  const planLabel = !entitlementsLoaded ? "…" : hasProPlan ? "Pro" : "Free";
  const displayName = user?.firstName || user?.username || "Account";
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen && !notifMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountMenuOpen && !accountMenuRef.current?.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (notifMenuOpen && !notifMenuRef.current?.contains(target)) {
        setNotifMenuOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountMenuOpen(false);
      setNotifMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [accountMenuOpen, notifMenuOpen]);

  const minimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Best effort only.
    }
  };

  const closeWindow = async () => {
    try {
      // Prefer window close so App onCloseRequested can end routing first.
      await getCurrentWindow().close();
      return;
    } catch {
      // Fall back to exit command (Rust still runs safe local cleanup).
    }
    try {
      await api.exitApp();
    } catch {
      // Best effort only.
    }
  };

  const openBilling = () => {
    setAccountMenuOpen(false);
    onNavigate?.("billing");
  };

  const openHelp = () => {
    setAccountMenuOpen(false);
    onNavigate?.("help");
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    clearRouteAuth();
    window.dispatchEvent(new CustomEvent("routelag:logout"));
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      // Best effort — local auth is already cleared.
    }
  };

  const openNotification = (item: AppNotification) => {
    markRead(item.id);
    setNotifMenuOpen(false);
    onNavigate?.(item.href);
  };

  return (
    <header className="drag-header" data-tauri-drag-region>
      <button
        type="button"
        className="drag-header-brand"
        aria-label="Open Zer0 dashboard"
        onClick={() => onNavigate?.("games")}
        onPointerDown={stopWindowDrag}
      >
        <img src="/routelag-logo.png" alt="" />
        <span>Zer0</span>
      </button>

      {sessionStrip && <SessionStrip strip={sessionStrip} />}

      <div className="header-spacer" data-tauri-drag-region aria-hidden="true" />

      {onNavigate && (
        <div className="header-account-actions">
          <div className="header-notification-menu" ref={notifMenuRef}>
            <button
              type="button"
              className={`header-notification${notifMenuOpen ? " is-open" : ""}`}
              aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
              aria-haspopup="menu"
              aria-expanded={notifMenuOpen}
              onPointerDown={stopWindowDrag}
              onClick={() => {
                setAccountMenuOpen(false);
                setNotifMenuOpen((open) => !open);
              }}
            >
              <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
              {unreadCount > 0 && <span aria-hidden="true" />}
            </button>
            <div
              className={`header-notification-dropdown${notifMenuOpen ? " is-open" : ""}`}
              role="menu"
              aria-hidden={!notifMenuOpen}
            >
              <div className="header-notification-dropdown-head">
                <strong>Notifications</strong>
                <button
                  type="button"
                  className="header-notification-mark-all"
                  disabled={unreadCount === 0}
                  tabIndex={notifMenuOpen ? 0 : -1}
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              </div>
              {notifications.length ? (
                <ul className="header-notification-list">
                  {notifications.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        className={`header-notification-item${item.read ? "" : " is-unread"}`}
                        tabIndex={notifMenuOpen ? 0 : -1}
                        onClick={() => openNotification(item)}
                      >
                        <span className="header-notification-item-dot" aria-hidden="true" />
                        <span className="header-notification-item-copy">
                          <strong>{item.title}</strong>
                          <span>{item.body}</span>
                        </span>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {formatNotificationAge(item.createdAt)}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="header-notification-empty">You’re all caught up.</p>
              )}
              <button
                type="button"
                className="header-notification-view-all"
                tabIndex={notifMenuOpen ? 0 : -1}
                onClick={() => {
                  markAllRead();
                  setNotifMenuOpen(false);
                }}
              >
                View all notifications
              </button>
            </div>
          </div>
          <Show when="signed-in">
            <div className="header-account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className={`header-profile${accountMenuOpen ? " is-open" : ""}`}
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onPointerDown={stopWindowDrag}
                onClick={() => {
                  setNotifMenuOpen(false);
                  setAccountMenuOpen((open) => !open);
                }}
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" />
                ) : (
                  <span className="header-profile-fallback"><UserRound size={17} /></span>
                )}
                <span className="header-profile-copy">
                  <strong>{displayName}</strong>
                  <small>{planLabel}</small>
                </span>
                <ChevronDown
                  className={`header-profile-caret${accountMenuOpen ? " is-open" : ""}`}
                  size={14}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </button>
              <div
                className={`header-account-dropdown${accountMenuOpen ? " is-open" : ""}`}
                role="menu"
                aria-hidden={!accountMenuOpen}
              >
                <div className="header-account-dropdown-identity">
                  <strong>{displayName}</strong>
                  <small>{planLabel}</small>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={accountMenuOpen ? 0 : -1}
                  onClick={openBilling}
                >
                  Manage subscription
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={accountMenuOpen ? 0 : -1}
                  onClick={openHelp}
                >
                  Help / report a problem
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  tabIndex={accountMenuOpen ? 0 : -1}
                  onClick={() => void handleSignOut()}
                >
                  Sign out
                </button>
              </div>
            </div>
          </Show>
          <Show when="signed-out">
            <button
              type="button"
              className="header-profile"
              aria-label="Open account"
              onPointerDown={stopWindowDrag}
              onClick={() => onNavigate("billing")}
            >
              <span className="header-profile-fallback"><UserRound size={17} /></span>
              <span className="header-profile-copy">
                <strong>Account</strong>
                <small>Zer0</small>
              </span>
            </button>
          </Show>
        </div>
      )}

      <div className="window-actions" aria-label="Window controls">
        <button
          type="button"
          className="minimize-btn"
          aria-label="Minimize Zer0"
          onPointerDown={stopWindowDrag}
          onClick={() => void minimizeWindow()}
        >
          <Minus size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="close-btn"
          aria-label="Close Zer0"
          onPointerDown={stopWindowDrag}
          onClick={() => void closeWindow()}
        >
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function SessionStrip({ strip }: { strip: SessionStripProps }) {
  const {
    connected,
    connecting = false,
    actionBusy = false,
    routeCity,
    regionLabel,
    pingMs,
    hudOn = HUD_ENABLED,
    replayCaptureOn = REPLAY_ENABLED,
    onConnect,
    onDisconnect,
    onOpenHud,
    onOpenReplays,
  } = strip;

  const routeValue = connected
    ? [routeCity, regionLabel ? formatRegion(regionLabel) : null]
        .filter(Boolean)
        .join(" → ") || "Active"
    : "Auto";

  const statusLabel = connecting
    ? "Connecting"
    : connected
      ? "Connected"
      : "Not Connected";

  const actionLabel = connecting
    ? "Connecting…"
    : connected
      ? "Disconnect"
      : "Connect";

  return (
    <div
      className={`session-strip${connected ? " is-connected" : ""}${connecting ? " is-connecting" : ""}`}
      role="status"
      aria-live="polite"
      onPointerDown={stopWindowDrag}
    >
      <div className="session-strip-state">
        <i aria-hidden="true" />
        <div className="session-strip-metric">
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>

      <div className="session-strip-metrics">
        <div className="session-strip-metric" title={routeValue}>
          <span>Route</span>
          <strong>{routeValue}</strong>
        </div>

        {connected && pingMs != null && (
          <div className="session-strip-metric">
            <span>Latency</span>
            <strong>{pingMs} ms</strong>
          </div>
        )}

        {HUD_ENABLED ? (
          <button
            type="button"
            className={`session-strip-metric is-interactive${hudOn ? " is-on" : ""}`}
            onClick={onOpenHud}
            disabled={!onOpenHud}
            title="Open HUD settings"
          >
            <span>HUD</span>
            <strong>{hudOn ? "Enabled" : "Off"}</strong>
          </button>
        ) : (
          <div className="session-strip-metric is-disabled" title="HUD coming soon">
            <span>HUD</span>
            <strong>Soon</strong>
          </div>
        )}

        {REPLAY_ENABLED ? (
          <button
            type="button"
            className={`session-strip-metric is-interactive${replayCaptureOn ? " is-on" : ""}`}
            onClick={onOpenReplays}
            disabled={!onOpenReplays}
            title="Open Replays"
          >
            <span>Replay</span>
            <strong>{replayCaptureOn ? "Ready" : "Off"}</strong>
          </button>
        ) : (
          <div className="session-strip-metric is-disabled" title="Replay Engine coming soon">
            <span>Replay</span>
            <strong>Soon</strong>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`session-strip-action${connected ? " is-disconnect" : ""}`}
        disabled={actionBusy || connecting}
        onClick={() => (connected ? onDisconnect() : onConnect())}
      >
        {actionLabel}
      </button>
    </div>
  );
}
