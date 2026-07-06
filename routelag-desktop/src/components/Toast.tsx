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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  exiting?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5200;
const TOAST_EXIT_MS = 220;

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
    (message: string, tone: ToastTone = "info") => {
      const id = nextToastId();
      setToasts((prev) => [...prev, { id, message, tone }]);

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
            const Icon = toneMeta[toast.tone].icon;
            return (
              <div
                key={toast.id}
                className={`rl-toast rl-toast--${toast.tone}${toast.exiting ? " is-exiting" : ""}`}
                role="status"
              >
                <span className="rl-toast__icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <p className="rl-toast__message">{toast.message}</p>
                <button
                  type="button"
                  className="rl-toast__dismiss"
                  aria-label={`Dismiss ${toneMeta[toast.tone].label.toLowerCase()} notification`}
                  onClick={() => dismissToast(toast.id)}
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
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
