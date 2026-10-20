"use client";

import { useState } from "react";
import { rangeScale, niceScale, useWidth } from "./use-size";

export interface LinePoint {
  x: number; // e.g. epoch days
  y: number;
  label: string; // x label for tooltip/axis
  tooltip: string;
}

/**
 * Single-series line chart (SVG, measured width). 2px line, markers for sparse data,
 * crosshair + tooltip on hover/tap, recessive grid. One y-axis only.
 */
export function LineChart({
  points,
  height = 180,
  formatTick = (v) => String(v),
  zeroBased = false,
  ariaLabel,
}: {
  points: LinePoint[];
  height?: number;
  formatTick?: (v: number) => string;
  zeroBased?: boolean;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;

  const ys = points.map((p) => p.y);
  const scale = zeroBased
    ? { min: 0, ...niceScale(Math.max(...ys, 0)) }
    : rangeScale(Math.min(...ys), Math.max(...ys));
  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  const sx = (x: number) => padL + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
  const sy = (y: number) => padT + (1 - (y - scale.min) / (scale.max - scale.min || 1)) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const showMarkers = points.length <= 24;
  const labelIdx = new Set<number>();
  if (points.length) {
    const n = Math.min(5, points.length);
    for (let k = 0; k < n; k++) labelIdx.add(Math.round((k * (points.length - 1)) / Math.max(1, n - 1)));
  }

  function onMove(clientX: number, rect: DOMRect) {
    const x = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setActive(best);
  }

  const a = active != null ? points[active] : null;
  return (
    <figure ref={ref} className="relative w-full" aria-label={ariaLabel}>
      {width > 0 && points.length > 0 ? (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={ariaLabel}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={padL - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-subtle)" className="tabular">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {[...labelIdx].map((i) => (
            <text key={i} x={sx(points[i].x)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--text-subtle)">
              {points[i].label}
            </text>
          ))}
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {showMarkers
            ? points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />)
            : null}
          {a ? (
            <g pointerEvents="none">
              <line x1={sx(a.x)} x2={sx(a.x)} y1={padT} y2={padT + innerH} stroke="var(--text-subtle)" strokeDasharray="3 3" />
              <circle cx={sx(a.x)} cy={sy(a.y)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {a ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(sx(a.x), 70), width - 70) }}
        >
          <span className="text-muted">{a.label}</span> · <span className="tabular font-medium text-text">{a.tooltip}</span>
        </div>
      ) : null}
    </figure>
  );
}
