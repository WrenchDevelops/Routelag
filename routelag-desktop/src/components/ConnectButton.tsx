interface ConnectButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "connect" | "disconnect";
  loading?: boolean;
}

export function ConnectButton({
  label,
  onClick,
  disabled,
  variant,
  loading,
}: ConnectButtonProps) {
  const base =
    "w-full rounded-xl px-6 py-4 text-lg font-semibold transition-colors";
  const styles =
    variant === "connect"
      ? "bg-accent text-white hover:bg-accent/90 disabled:bg-accent/40"
      : "border border-border bg-card text-gray-100 hover:bg-white/5 disabled:opacity-40";

  return (
    <button
      type="button"
      className={`${base} ${styles} ${loading ? "cursor-wait" : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? "Please wait..." : label}
    </button>
  );
}
