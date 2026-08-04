import type { ThrowSource } from '../types/domain';

export interface BoardHitEvent {
  segment: number;
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  /** Landing coordinates, when the source can provide them (manual board click, camera). */
  x?: number;
  y?: number;
  raw?: unknown;
}

/**
 * Common interface every dartboard integration implements. Phase 1 ships only
 * `ManualInputAdapter`; Phase 2 adds real BLE adapters (Granboard, etc.)
 * behind this same interface so skill-check/game code never branches on
 * device type.
 */
export interface BoardAdapter {
  id: string;
  displayName: string;
  source: ThrowSource;
  /** Whether this adapter can run in the current browser/environment. */
  isAvailable(): boolean;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Subscribe to hit events. Returns an unsubscribe function. */
  onHit(callback: (event: BoardHitEvent) => void): () => void;
}

type Listener = (event: BoardHitEvent) => void;

/**
 * Phase 1 fallback adapter: hits are fed in by the on-screen dartboard (or
 * any future manual form) via `reportHit`, rather than a real device. Every
 * BLE adapter added later reuses this same event-subscription contract.
 */
export class ManualInputAdapter implements BoardAdapter {
  id = 'manual';
  displayName = '手動入力';
  source: ThrowSource = 'manual';
  private listeners = new Set<Listener>();
  private connected = false;

  isAvailable(): boolean {
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onHit(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  reportHit(event: BoardHitEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/**
 * Phase 2 placeholder. Real implementations connect via
 * `navigator.bluetooth`, discover the vendor GATT service/characteristics,
 * decode segment-hit notifications, and call the shared hit-listener set
 * exactly like `ManualInputAdapter.reportHit`. Left unimplemented here; each
 * board's GATT service UUID / characteristic layout must be confirmed with
 * the manufacturer (or via reverse-engineering where ToS allows) before
 * writing the decode logic.
 */
export class UnsupportedBleAdapter implements BoardAdapter {
  id: string;
  displayName: string;
  source: ThrowSource;
  private listeners = new Set<Listener>();

  constructor(id: string, displayName: string, source: ThrowSource) {
    this.id = id;
    this.displayName = displayName;
    this.source = source;
  }

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  isConnected(): boolean {
    return false;
  }

  async connect(): Promise<void> {
    throw new Error(`${this.displayName} は現在未対応です（Phase 2で実装予定）`);
  }

  async disconnect(): Promise<void> {
    // no-op: never connected
  }

  onHit(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const manualInputAdapter = new ManualInputAdapter();

/** Registry of all known board adapters, keyed by id. Extend in Phase 2+. */
export const boardAdapterRegistry: BoardAdapter[] = [
  manualInputAdapter,
  new UnsupportedBleAdapter('granboard', 'Granboard シリーズ', 'board:granboard'),
  new UnsupportedBleAdapter('unicorn-eclipse', 'Unicorn Eclipse / Bullshooter', 'board:unicorn-eclipse'),
  new UnsupportedBleAdapter('dartslive-home', 'DARTSLIVE HOME', 'board:dartslive-home'),
  new UnsupportedBleAdapter('phoenix', 'Phoenix Darts', 'board:phoenix'),
];
