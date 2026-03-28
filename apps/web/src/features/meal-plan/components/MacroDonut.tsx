'use client';

import { useState } from 'react';

interface MacroDonutProps {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  size?: number;
}

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────

export function MacroDonut({ protein, carbs, fat, calories, size = 36 }: MacroDonutProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const total = protein + carbs + fat;
  if (total === 0) return null;

  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  // Segment data: protein=blue, carbs=amber, fat=green
  const segments = [
    { value: protein, color: '#3b82f6', label: 'Protein', unit: 'g' },
    { value: carbs, color: '#f59e0b', label: 'Carbs', unit: 'g' },
    { value: fat, color: '#22c55e', label: 'Fat', unit: 'g' },
  ];

  // Build arc paths
  let offset = 0; // starts at top (rotate -90deg via transform)
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dashArray = `${pct * circumference} ${circumference}`;
    const dashOffset = -offset * circumference;
    offset += pct;
    return { ...seg, dashArray, dashOffset };
  });

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg]"
        aria-hidden="true"
      >
        {/* Track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={5} />
        {/* Segments */}
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={5}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
          />
        ))}
      </svg>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg">
          <p className="mb-1.5 text-center text-[11px] font-semibold text-gray-700">
            {calories} kcal
          </p>
          <div className="space-y-1">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="whitespace-nowrap text-[11px] text-gray-600">
                  {seg.label}:{' '}
                  <span className="font-semibold text-gray-900">
                    {seg.value}
                    {seg.unit}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
