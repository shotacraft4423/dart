import { useEffect, useRef } from 'react';
import { manualInputAdapter, type BoardAdapter, type BoardHitEvent } from '../adapters/boardAdapter';
import type { DartThrow } from '../types/domain';

/**
 * Wires a `BoardAdapter`'s hit stream into a `DartThrow` callback. Defaults to
 * the manual adapter (fed by `DartBoard` clicks via `reportBoardHit`);
 * swapping in a real BLE adapter in Phase 2 requires no change on the
 * caller's side, since both flow through the same `onHit` subscription.
 */
export function useThrowInput(onThrow: (t: DartThrow) => void, adapter: BoardAdapter = manualInputAdapter) {
  const onThrowRef = useRef(onThrow);
  onThrowRef.current = onThrow;

  useEffect(() => {
    return adapter.onHit((event: BoardHitEvent) => {
      onThrowRef.current({
        segment: event.segment,
        multiplier: event.multiplier,
        score: event.score,
        x: event.x,
        y: event.y,
        source: adapter.source,
        timestamp: new Date().toISOString(),
      });
    });
  }, [adapter]);

  function reportBoardHit(hit: BoardHitEvent) {
    manualInputAdapter.reportHit(hit);
  }

  return { reportBoardHit };
}
