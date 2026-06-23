import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────
export interface Monitor {
  id: number;
  name: string;
  type: 'http' | 'tcp' | 'icmp' | 'ssl' | 'dns';
  url: string;
  port: number | null;
  interval: number;
  timeout: number;
  keyword: string | null;
  expectedStatus: number | null;
  webhookUrl: string | null;
  maintenanceUntil: number | null;
  isPublic: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NewMonitor = Omit<
  Monitor,
  'id' | 'createdAt' | 'updatedAt' | 'maintenanceUntil'
>;

export interface Heartbeat {
  id: number;
  monitorId: number;
  status: 'up' | 'down';
  latency: number | null;
  message: string | null;
  createdAt: number;
}

export interface Settings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  notificationEmail: string;
}

interface Database {
  monitors: Monitor[];
  heartbeats: Heartbeat[];
  settings: Settings;
  nextMonitorId: number;
  nextHeartbeatId: number;
}

// ── Path ─────────────────────────────────────────────────────────────────
const dbPath =
  process.env.DB_PATH || path.join(process.cwd(), 'db.json');

// ── Default state ────────────────────────────────────────────────────────
function getDefaultDb(): Database {
  return {
    monitors: [],
    heartbeats: [],
    settings: {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      notificationEmail: '',
    },
    nextMonitorId: 1,
    nextHeartbeatId: 1,
  };
}

// ── Load ─────────────────────────────────────────────────────────────────
function loadDb(): Database {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultDb(),
        ...parsed,
        settings: {
          ...getDefaultDb().settings,
          ...(parsed.settings || {}),
        },
      };
    }
  } catch (err) {
    console.error('Failed to load database, starting fresh:', err);
  }
  return getDefaultDb();
}

// ── In-memory state (always current) ─────────────────────────────────────
let db: Database = loadDb();

// ── Atomic, debounced disk writer ────────────────────────────────────────
// All mutations update the in-memory `db` immediately.
// Disk writes are coalesced: at most one write per tick, using atomic
// write-to-temp + rename so a crash never leaves a half-written file.

let writeScheduled = false;
let writeInProgress = false;
let dirtySinceLastFlush = false;

function scheduleFlush(): void {
  dirtySinceLastFlush = true;
  if (writeScheduled) return;
  writeScheduled = true;

  // Use setImmediate so rapid successive mutations in the same tick
  // produce only a single fsync on the next event-loop turn.
  setImmediate(() => {
    writeScheduled = false;
    if (!dirtySinceLastFlush) return;
    flushNow();
  });
}

function flushNow(): void {
  if (writeInProgress) {
    // Another flush is already writing; re-schedule one more after it.
    writeScheduled = true;
    return;
  }

  writeInProgress = true;
  dirtySinceLastFlush = false;

  const dir = path.dirname(dbPath);
  const tmpPath = dbPath + '.' + randomBytes(4).readUInt32LE(0).toString(16) + '.tmp';

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write JSON to a temp file, fsync it, then atomically rename.
    const payload = JSON.stringify(db, null, 2);
    fs.writeFileSync(tmpPath, payload, { flush: true });
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('[DB] Failed to flush database:', err);
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch { /* ignore */ }
  } finally {
    writeInProgress = false;
    // If another mutation landed while we were writing, flush again.
    if (dirtySinceLastFlush || writeScheduled) {
      writeScheduled = false;
      scheduleFlush();
    }
  }
}

/** Force an immediate synchronous flush (used before process exit). */
function flushSync(): void {
  dirtySinceLastFlush = false;
  writeScheduled = false;
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = dbPath + '.sync.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), { flush: true });
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('[DB] Failed sync flush:', err);
  }
}

// ── Heartbeat cap (circular buffer) ──────────────────────────────────────
const MAX_HEARTBEATS = 10_000;
const HEARTBEAT_RETAIN = 5_000;

function enforceHeartbeatCap(): void {
  if (db.heartbeats.length > MAX_HEARTBEATS) {
    db.heartbeats = db.heartbeats.slice(-HEARTBEAT_RETAIN);
  }
}

// ── Public API ───────────────────────────────────────────────────────────
export const jsonDb = {
  monitors: {
    findMany: (): Monitor[] => [...db.monitors],

    findFirst: (id: number): Monitor | null =>
      db.monitors.find((m) => m.id === id) ?? null,

    create: (data: NewMonitor): Monitor => {
      const now = Date.now();
      const monitor: Monitor = {
        ...data,
        id: db.nextMonitorId++,
        maintenanceUntil: null,
        createdAt: now,
        updatedAt: now,
      };
      db.monitors.push(monitor);
      scheduleFlush();
      return monitor;
    },

    update: (id: number, data: Partial<Monitor>): Monitor | null => {
      const idx = db.monitors.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      db.monitors[idx] = {
        ...db.monitors[idx],
        ...data,
        updatedAt: Date.now(),
      };
      scheduleFlush();
      return db.monitors[idx];
    },

    delete: (id: number): boolean => {
      const idx = db.monitors.findIndex((m) => m.id === id);
      if (idx === -1) return false;
      db.monitors.splice(idx, 1);
      db.heartbeats = db.heartbeats.filter((h) => h.monitorId !== id);
      scheduleFlush();
      return true;
    },
  },

  heartbeats: {
    findMany: (monitorId: number, limit = 1440): Heartbeat[] =>
      db.heartbeats
        .filter((h) => h.monitorId === monitorId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit),

    create: (data: Omit<Heartbeat, 'id'>): Heartbeat => {
      const heartbeat: Heartbeat = {
        ...data,
        id: db.nextHeartbeatId++,
      };
      db.heartbeats.push(heartbeat);
      enforceHeartbeatCap();
      scheduleFlush();
      return heartbeat;
    },
  },

  settings: {
    get: (): Settings => ({ ...db.settings }),

    update: (data: Partial<Settings>): Settings => {
      db.settings = { ...db.settings, ...data };
      scheduleFlush();
      return db.settings;
    },
  },

  /** Force immediate disk flush (call before process exit). */
  flushSync,
};
