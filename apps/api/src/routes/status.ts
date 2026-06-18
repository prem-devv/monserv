import { FastifyInstance } from 'fastify';
import { jsonDb } from '../db/jsonDb.js';
import axios from 'axios';

export async function statusRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async (request, reply) => {
    const monitors = jsonDb.monitors.findMany().filter(m => m.isPublic);

    const publicMonitors = await Promise.all(
      monitors.map(async (monitor) => {
        const heartbeats = jsonDb.heartbeats.findMany(monitor.id, 1);
        const lastHeartbeat = heartbeats.length > 0 ? heartbeats[0] : null;
        const uptime = calculateUptime(monitor.id);

        return {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          status: lastHeartbeat?.status || 'pending',
          latency: lastHeartbeat?.latency || null,
          uptime,
          lastCheck: lastHeartbeat?.createdAt || null,
        };
      })
    );

    const allUp = publicMonitors.every(m => m.status === 'up');
    const anyDown = publicMonitors.some(m => m.status === 'down');
    
    let overallStatus = 'operational';
    if (anyDown) overallStatus = 'down';
    else if (publicMonitors.some(m => m.status === 'degraded')) overallStatus = 'degraded';

    return reply.send({
      overallStatus,
      monitors: publicMonitors,
    });
  });

  fastify.post('/webhooks/test', async (request, reply) => {
    const { url } = request.body as { url: string };
    
    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    try {
      await axios.post(url, {
        type: 'test',
        message: 'Monserv webhook test',
        timestamp: Date.now(),
      });
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ 
        error: 'Webhook failed', 
        message: error.message 
      });
    }
  });
}

function calculateUptime(monitorId: number): number {
  const heartbeats = jsonDb.heartbeats.findMany(monitorId, 1440);
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
  const recentHeartbeats = heartbeats.filter(h => h.createdAt > cutoffTime);
  
  if (recentHeartbeats.length === 0) return 100;
  
  const upCount = recentHeartbeats.filter(h => h.status === 'up').length;
  return (upCount / recentHeartbeats.length) * 100;
}