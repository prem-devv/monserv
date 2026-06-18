import { jsonDb } from '../db/jsonDb.js';

export async function getUptimePercentage(monitorId: number): Promise<number> {
  const heartbeats = jsonDb.heartbeats.findMany(monitorId, 1440);
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
  const recentHeartbeats = heartbeats.filter((h: any) => h.createdAt > cutoffTime);
  
  if (recentHeartbeats.length === 0) return 100;
  
  const upCount = recentHeartbeats.filter((h: any) => h.status === 'up').length;
  return (upCount / recentHeartbeats.length) * 100;
}
