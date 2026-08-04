import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Player, ExternalRatingEntry, SkillCheckSession, FormAnalysisSession } from '../types/domain';

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
  settings: {
    key: string;
    value: unknown;
  };
  formSessions: {
    key: string;
    value: FormAnalysisSession;
    indexes: { 'by-player': string };
  };
}

const DB_NAME = 'darts-practice-tool';
const DB_VERSION = 3;

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
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('formSessions')) {
          const store = db.createObjectStore('formSessions', { keyPath: 'id' });
          store.createIndex('by-player', 'playerId');
        }
        // Rating history is now derived live from sessions/externalRatings
        // (see lib/rating.ts) rather than logged, so deleting a session or
        // rating entry can no longer leave a stale point behind.
        const nativeDb = db as unknown as IDBDatabase;
        if (nativeDb.objectStoreNames.contains('ratingSnapshots')) {
          nativeDb.deleteObjectStore('ratingSnapshots');
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

export const formSessionRepo = {
  async listByPlayer(playerId: string): Promise<FormAnalysisSession[]> {
    const sessions = await (await getDB()).getAllFromIndex('formSessions', 'by-player', playerId);
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async put(session: FormAnalysisSession): Promise<void> {
    await (await getDB()).put('formSessions', session);
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('formSessions', id);
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
