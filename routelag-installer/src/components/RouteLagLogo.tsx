export function RouteLagLogo({ size = 96 }: { size?: number }) {
  return (
    <div className="routelag-logo-wrap" style={{ width: size, height: size }}>
      <img
        className="routelag-logo"
        src="/routelag-logo.png"
        alt="RouteLag"
        width={size}
        height={size}
        draggable={false}
      />
    </div>
  );
}
