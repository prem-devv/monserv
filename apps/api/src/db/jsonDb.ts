import fs from 'fs';
import path from 'path';

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

export type NewMonitor = Omit<Monitor, 'id' | 'createdAt' | 'updatedAt' | 'maintenanceUntil'>;

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

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'db.json');

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

function loadDb(): Database {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(data);
      return {
        ...getDefaultDb(),
        ...parsed,
        settings: {
          ...getDefaultDb().settings,
          ...(parsed.settings || {}),
        }
      };
    }
  } catch (err) {
    console.error('Failed to load database, starting fresh:', err);
  }
  return getDefaultDb();
}

function saveDb(db: Database): void {
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

let db: Database = loadDb();

export const jsonDb = {
  monitors: {
    findMany: () => [...db.monitors],
    findFirst: (id: number) => db.monitors.find(m => m.id === id) || null,
    create: (data: NewMonitor) => {
      const now = Date.now();
      const monitor: Monitor = {
        ...data,
        id: db.nextMonitorId++,
        maintenanceUntil: null,
        createdAt: now,
        updatedAt: now,
      };
      db.monitors.push(monitor);
      saveDb(db);
      return monitor;
    },
    update: (id: number, data: Partial<Monitor>) => {
      const idx = db.monitors.findIndex(m => m.id === id);
      if (idx === -1) return null;
      db.monitors[idx] = { ...db.monitors[idx], ...data, updatedAt: Date.now() };
      saveDb(db);
      return db.monitors[idx];
    },
    delete: (id: number) => {
      const idx = db.monitors.findIndex(m => m.id === id);
      if (idx === -1) return false;
      db.monitors.splice(idx, 1);
      db.heartbeats = db.heartbeats.filter(h => h.monitorId !== id);
      saveDb(db);
      return true;
    },
  },
  heartbeats: {
    findMany: (monitorId: number, limit = 1440) => {
      return db.heartbeats
        .filter(h => h.monitorId === monitorId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    create: (data: Omit<Heartbeat, 'id'>) => {
      const heartbeat: Heartbeat = {
        ...data,
        id: db.nextHeartbeatId++,
      };
      db.heartbeats.push(heartbeat);
      if (db.heartbeats.length > 10000) {
        db.heartbeats = db.heartbeats.slice(-5000);
      }
      saveDb(db);
      return heartbeat;
    },
  },
  settings: {
    get: () => ({ ...db.settings }),
    update: (data: Partial<Settings>) => {
      db.settings = { ...db.settings, ...data };
      saveDb(db);
      return db.settings;
    },
  },
};

export { saveDb };