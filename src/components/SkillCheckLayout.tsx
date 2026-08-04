import type { ReactNode } from 'react';
import { DartBoard, type BoardMarker } from './DartBoard';
import { ThrowLog } from './ThrowLog';
import type { DartThrow } from '../types/domain';
import type { BoardHitResult } from '../lib/dartboardGeometry';

interface SkillCheckLayoutProps {
  title: string;
  instructions: ReactNode;
  onHit: (hit: BoardHitResult) => void;
  disabled?: boolean;
  highlightSegment?: { segment: number; multiplier?: 0 | 1 | 2 | 3 };
  markers?: BoardMarker[];
  throws: DartThrow[];
  statsPanel: ReactNode;
  footer?: ReactNode;
  onUndo?: () => void;
}

export function SkillCheckLayout({
  title,
  instructions,
  onHit,
  disabled,
  highlightSegment,
  markers,
  throws,
  statsPanel,
  footer,
  onUndo,
}: SkillCheckLayoutProps) {
  return (
    <div className="skillcheck-layout">
      <div className="skillcheck-header">
        <h2>{title}</h2>
        <p className="skillcheck-instructions">{instructions}</p>
      </div>
      <div className="skillcheck-body">
        <div className="skillcheck-board">
          <DartBoard onHit={onHit} disabled={disabled} highlightSegment={highlightSegment} markers={markers} />
        </div>
        <div className="skillcheck-side">
          {statsPanel}
          <div className="throw-log-panel">
            <div className="throw-log-header">
              <h3>投擲履歴</h3>
              {onUndo && (
                <button className="btn-link" onClick={onUndo} disabled={throws.length === 0}>
                  1つ前に戻す
                </button>
              )}
            </div>
            <ThrowLog throws={throws} />
          </div>
        </div>
      </div>
      {footer && <div className="skillcheck-footer">{footer}</div>}
    </div>
  );
}
