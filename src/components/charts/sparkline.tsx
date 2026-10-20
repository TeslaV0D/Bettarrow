/** Tiny single-series column sparkline for small multiples (pure SVG, server-renderable). */
export function Sparkbars({ values, max, height = 28, label }: { values: number[]; max: number; height?: number; label: string }) {
  const n = Math.max(1, values.length);
  const w = 100 / n;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="block h-7 w-full" role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = max ? (v / max) * (height - 2) : 0;
        return v > 0 ? <rect key={i} x={i * w + w * 0.12} width={w * 0.76} y={height - h} height={h} rx={1} fill="var(--accent)" fillOpacity={0.75} /> : null;
      })}
      <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
