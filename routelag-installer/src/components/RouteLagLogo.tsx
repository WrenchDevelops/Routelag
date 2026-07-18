export function RouteLagLogo({ size = 88, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <div className="zer0-logo" aria-label="Zer0">
      <div className="zer0-logo-mark" style={{ width: size, height: size }}>
        <img src="/zer0-logo-mark.png" alt="" width={size} height={size} draggable={false} />
      </div>
      {showWordmark ? (
        <div className="zer0-logo-word">
          <span className="zer0-logo-brand">Zer0</span>
          <span className="zer0-logo-rule" />
        </div>
      ) : null}
    </div>
  );
}

export { RouteLagLogo as Zer0Logo };
