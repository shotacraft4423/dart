import { useRef } from 'react';
import { RADIUS_RATIO, SEGMENT_ORDER, resolveHit, type BoardHitResult } from '../lib/dartboardGeometry';
import './DartBoard.css';

const SIZE = 340;
const CENTER = SIZE / 2;
const R = SIZE / 2 - 20;

function polar(rRatio: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CENTER + rRatio * R * Math.sin(rad), CENTER - rRatio * R * Math.cos(rad)];
}

function annularSectorPath(rInner: number, rOuter: number, startAngle: number, endAngle: number): string {
  const [x1, y1] = polar(rOuter, startAngle);
  const [x2, y2] = polar(rOuter, endAngle);
  const [x3, y3] = polar(rInner, endAngle);
  const [x4, y4] = polar(rInner, startAngle);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter * R} ${rOuter * R} 0 0 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner * R} ${rInner * R} 0 0 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export interface BoardMarker {
  x: number;
  y: number;
  color?: string;
  label?: string;
}

interface DartBoardProps {
  onHit?: (hit: BoardHitResult) => void;
  disabled?: boolean;
  markers?: BoardMarker[];
  /** Highlight a segment (e.g. the current target) with an outline. */
  highlightSegment?: { segment: number; multiplier?: 0 | 1 | 2 | 3 };
}

export function DartBoard({ onHit, disabled, markers = [], highlightSegment }: DartBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (disabled || !onHit) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    const x = (px - CENTER) / R;
    const y = (py - CENTER) / R;
    onHit(resolveHit(x, y));
  }

  const wedges = SEGMENT_ORDER.map((segment, i) => {
    const start = i * 18 - 9;
    const end = i * 18 + 9;
    const parity = i % 2;
    const singleColor = parity === 0 ? '#16181c' : '#eee2c9';
    const ringColor = parity === 0 ? '#c0392b' : '#1e7d32';
    const isHighlighted = (mult: 0 | 1 | 2 | 3) =>
      highlightSegment?.segment === segment &&
      (highlightSegment.multiplier === undefined || highlightSegment.multiplier === mult);

    return (
      <g key={segment}>
        <path
          d={annularSectorPath(RADIUS_RATIO.outerBull, RADIUS_RATIO.tripleInner, start, end)}
          fill={singleColor}
          stroke={isHighlighted(1) ? '#ffd23f' : 'none'}
          strokeWidth={isHighlighted(1) ? 3 : 0}
        />
        <path
          d={annularSectorPath(RADIUS_RATIO.tripleInner, RADIUS_RATIO.tripleOuter, start, end)}
          fill={ringColor}
          stroke={isHighlighted(3) ? '#ffd23f' : 'none'}
          strokeWidth={isHighlighted(3) ? 3 : 0}
        />
        <path
          d={annularSectorPath(RADIUS_RATIO.tripleOuter, RADIUS_RATIO.doubleInner, start, end)}
          fill={singleColor}
        />
        <path
          d={annularSectorPath(RADIUS_RATIO.doubleInner, RADIUS_RATIO.doubleOuter, start, end)}
          fill={ringColor}
          stroke={isHighlighted(2) ? '#ffd23f' : 'none'}
          strokeWidth={isHighlighted(2) ? 3 : 0}
        />
      </g>
    );
  });

  const labels = SEGMENT_ORDER.map((segment, i) => {
    const angle = i * 18;
    const [x, y] = polar(RADIUS_RATIO.doubleOuter + 0.09, angle);
    return (
      <text key={segment} x={x} y={y} className="dartboard-label" textAnchor="middle" dominantBaseline="middle">
        {segment}
      </text>
    );
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={`dartboard-svg${disabled ? ' dartboard-disabled' : ''}`}
      onClick={handleClick}
      role="img"
      aria-label="ダーツボード"
    >
      <circle cx={CENTER} cy={CENTER} r={R * RADIUS_RATIO.doubleOuter + 6} fill="#0b0c0e" />
      {wedges}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={R * RADIUS_RATIO.outerBull}
        fill="#1e7d32"
        stroke={highlightSegment?.segment === 25 && highlightSegment.multiplier !== 2 ? '#ffd23f' : 'none'}
        strokeWidth={3}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={R * RADIUS_RATIO.bullseye}
        fill="#c0392b"
        stroke={highlightSegment?.segment === 25 && highlightSegment.multiplier !== 1 ? '#ffd23f' : 'none'}
        strokeWidth={3}
      />
      {labels}
      {markers.map((m, i) => (
        <circle
          key={i}
          cx={CENTER + m.x * R}
          cy={CENTER + m.y * R}
          r={4}
          fill={m.color ?? '#2f6fed'}
          stroke="#fff"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
