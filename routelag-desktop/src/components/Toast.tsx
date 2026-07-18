import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastOptions {
  onClick?: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  exiting?: boolean;
  onClick?: () => void;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5200;
const TOAST_EXIT_MS = 280;

const toneMeta: Record<
  ToastTone,
  { icon: typeof Info; label: string }
> = {
  info: { icon: Info, label: "Info" },
  success: { icon: CheckCircle2, label: "Success" },
  warning: { icon: AlertTriangle, label: "Warning" },
  error: { icon: AlertCircle, label: "Error" },
};

let toastIdCounter = 0;

function nextToastId() {
  toastIdCounter += 1;
  return Date.now() + toastIdCounter;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)),
    );

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info", options?: ToastOptions) => {
      const id = nextToastId();
      setToasts((prev) => [
        ...prev.slice(-2),
        { id, message, tone, onClick: options?.onClick },
      ]);

      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className="rl-toast-stack" aria-live="polite" aria-relevant="additions">
          {toasts.map((toast) => {
            const meta = toneMeta[toast.tone];
            const Icon = meta.icon;
            const actionable = Boolean(toast.onClick);
            return (
              <div
                key={toast.id}
                className={`rl-toast rl-toast--${toast.tone}${toast.exiting ? " is-exiting" : ""}${actionable ? " is-actionable" : ""}`}
                role={actionable ? "button" : "status"}
                tabIndex={actionable ? 0 : undefined}
                style={
                  {
                    "--rl-toast-duration": `${TOAST_DURATION_MS}ms`,
                  } as CSSProperties
                }
                onClick={
                  actionable
                    ? () => {
                        toast.onClick?.();
                        dismissToast(toast.id);
                      }
                    : undefined
                }
                onKeyDown={
                  actionable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toast.onClick?.();
                          dismissToast(toast.id);
                        }
                      }
                    : undefined
                }
              >
                <span className="rl-toast__icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                <div className="rl-toast__copy">
                  <span className="rl-toast__label">{meta.label}</span>
                  <p className="rl-toast__message">{toast.message}</p>
                  {actionable ? (
                    <span className="rl-toast__hint">Click for options</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rl-toast__dismiss"
                  aria-label={`Dismiss ${meta.label.toLowerCase()} notification`}
                  onClick={(event) => {
                    event.stopPropagation();
                    dismissToast(toast.id);
                  }}
                >
                  <X size={14} strokeWidth={2} />
                </button>
                <span className="rl-toast__progress" aria-hidden="true" />
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
