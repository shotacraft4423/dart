import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Player } from '../types/domain';
import { playerRepo } from '../db/database';

interface PlayerContextValue {
  player: Player | null;
  loading: boolean;
  renamePlayer: (name: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const DEFAULT_PLAYER_ID = 'local-player';

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let p = await playerRepo.get(DEFAULT_PLAYER_ID);
      if (!p) {
        p = { id: DEFAULT_PLAYER_ID, name: 'プレイヤー1', createdAt: new Date().toISOString() };
        await playerRepo.put(p);
      }
      if (!cancelled) {
        setPlayer(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function renamePlayer(name: string) {
    if (!player) return;
    const updated = { ...player, name };
    await playerRepo.put(updated);
    setPlayer(updated);
  }

  return <PlayerContext.Provider value={{ player, loading, renamePlayer }}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
