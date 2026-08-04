import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Player,
  ExternalRatingEntry,
  SkillCheckSession,
  RatingSnapshot,
} from '../types/domain';

interface DartsDB extends DBSchema {
  players: {
    key: string;
    value: Player;
  };
  externalRatings: {
    key: string;
    value: ExternalRatingEntry;
    indexes: { 'by-player': string };
  };
  skillCheckSessions: {
    key: string;
    value: SkillCheckSession;
    indexes: { 'by-player': string };
  };
  ratingSnapshots: {
    key: string;
    value: RatingSnapshot;
    indexes: { 'by-player': string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'darts-practice-tool';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DartsDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DartsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DartsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('players')) {
          db.createObjectStore('players', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('externalRatings')) {
          const store = db.createObjectStore('externalRatings', { keyPath: 'id' });
          store.createIndex('by-player', 'playerId');
        }
        if (!db.objectStoreNames.contains('skillCheckSessions')) {
          const store = db.createObjectStore('skillCheckSessions', { keyPath: 'id' });
          store.createIndex('by-player', 'playerId');
        }
        if (!db.objectStoreNames.contains('ratingSnapshots')) {
          const store = db.createObjectStore('ratingSnapshots', { keyPath: 'id' });
          store.createIndex('by-player', 'playerId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export const playerRepo = {
  async list(): Promise<Player[]> {
    return (await getDB()).getAll('players');
  },
  async get(id: string): Promise<Player | undefined> {
    return (await getDB()).get('players', id);
  },
  async put(player: Player): Promise<void> {
    await (await getDB()).put('players', player);
  },
};

export const externalRatingRepo = {
  async listByPlayer(playerId: string): Promise<ExternalRatingEntry[]> {
    return (await getDB()).getAllFromIndex('externalRatings', 'by-player', playerId);
  },
  async put(entry: ExternalRatingEntry): Promise<void> {
    await (await getDB()).put('externalRatings', entry);
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('externalRatings', id);
  },
};

export const skillCheckSessionRepo = {
  async listByPlayer(playerId: string): Promise<SkillCheckSession[]> {
    const sessions = await (await getDB()).getAllFromIndex(
      'skillCheckSessions',
      'by-player',
      playerId,
    );
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async get(id: string): Promise<SkillCheckSession | undefined> {
    return (await getDB()).get('skillCheckSessions', id);
  },
  async put(session: SkillCheckSession): Promise<void> {
    await (await getDB()).put('skillCheckSessions', session);
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('skillCheckSessions', id);
  },
};

export const ratingSnapshotRepo = {
  async listByPlayer(playerId: string): Promise<RatingSnapshot[]> {
    const snapshots = await (await getDB()).getAllFromIndex(
      'ratingSnapshots',
      'by-player',
      playerId,
    );
    return snapshots.sort((a, b) => a.date.localeCompare(b.date));
  },
  async put(snapshot: RatingSnapshot): Promise<void> {
    await (await getDB()).put('ratingSnapshots', snapshot);
  },
};

export const settingsRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await getDB()).get('settings', key) as Promise<T | undefined>;
  },
  async put(key: string, value: unknown): Promise<void> {
    await (await getDB()).put('settings', value, key);
  },
};
