import { jsonDb } from '../db/jsonDb.js';
import { z } from 'zod';
import { scheduleMonitorWithInterval, cancelMonitorSchedule, executeSingleCheck } from '../services/scheduler.js';
import axios from 'axios';
import { getUptimePercentage } from '../utils/uptime.js';
const createMonitorSchema = z.object({
    name: z.string().min(1).max(100).trim(),
    type: z.enum(['http', 'tcp', 'icmp']),
    url: z.string().min(1).max(2048).trim(),
    port: z.number().int().min(1).max(65535).optional().nullable(),
    interval: z.number().int().min(1).max(3600).default(60),
    timeout: z.number().int().min(1).max(30).default(10),
    keyword: z.string().max(255).optional().nullable(),
    expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
    webhookUrl: z.string().max(2048).url().optional().or(z.literal('')).nullable(),
    isPublic: z.boolean().default(false),
});
const updateMonitorSchema = createMonitorSchema.partial();
const testConnectionSchema = z.object({
    type: z.enum(['http', 'tcp', 'icmp']),
    url: z.string().min(1).max(2048).trim(),
    port: z.number().int().min(1).max(65535).optional().nullable(),
    timeout: z.number().int().min(1).max(30).default(10),
    keyword: z.string().max(255).optional().nullable(),
    expectedStatus: z.number().int().min(100).max(599).optional().nullable(),
    webhookUrl: z.string().max(2048).url().optional().or(z.literal('')).nullable(),
});
export async function monitorRoutes(fastify) {
    fastify.get('/monitors', async (request, reply) => {
        const monitors = jsonDb.monitors.findMany().sort((a, b) => b.createdAt - a.createdAt);
        const monitorsWithStatus = await Promise.all(monitors.map(async (monitor) => {
            const heartbeats = jsonDb.heartbeats.findMany(monitor.id, 1);
            const lastHeartbeat = heartbeats.length > 0 ? heartbeats[0] : null;
            const uptime = await getUptimePercentage(monitor.id);
            return {
                ...monitor,
                status: lastHeartbeat?.status || 'pending',
                latency: lastHeartbeat?.latency || null,
                uptime,
            };
        }));
        return reply.send(monitorsWithStatus);
    });
    fastify.get('/monitors/:id', async (request, reply) => {
        const { id } = request.params;
        const monitor = jsonDb.monitors.findFirst(parseInt(id));
        if (!monitor) {
            return reply.code(404).send({ error: 'Monitor not found' });
        }
        const heartbeats = jsonDb.heartbeats.findMany(monitor.id, 1);
        const lastHeartbeat = heartbeats.length > 0 ? heartbeats[0] : null;
        const uptime = await getUptimePercentage(monitor.id);
        return reply.send({
            ...monitor,
            status: lastHeartbeat?.status || 'pending',
            latency: lastHeartbeat?.latency || null,
            uptime,
        });
    });
    fastify.post('/monitors', async (request, reply) => {
        const data = createMonitorSchema.parse(request.body);
        const monitor = jsonDb.monitors.create({
            name: data.name,
            type: data.type,
            url: data.url || '',
            port: data.port || null,
            interval: data.interval,
            timeout: data.timeout,
            keyword: data.keyword || null,
            expectedStatus: data.expectedStatus || null,
            webhookUrl: data.webhookUrl || null,
            isPublic: data.isPublic,
            active: true,
        });
        // Run first check immediately and await it so caller gets real status
        try {
            await scheduleMonitorWithInterval(monitor.id, monitor.interval);
        }
        catch (error) {
            console.error('Failed to schedule monitor:', error);
        }
        // Return monitor with real status from first check
        const heartbeats = jsonDb.heartbeats.findMany(monitor.id, 1);
        const lastHeartbeat = heartbeats.length > 0 ? heartbeats[0] : null;
        return reply.code(201).send({
            ...monitor,
            status: lastHeartbeat?.status || 'pending',
            latency: lastHeartbeat?.latency || null,
        });
    });
    fastify.put('/monitors/:id', async (request, reply) => {
        const { id } = request.params;
        const data = updateMonitorSchema.parse(request.body);
        const existing = jsonDb.monitors.findFirst(parseInt(id));
        if (!existing) {
            return reply.code(404).send({ error: 'Monitor not found' });
        }
        const updated = jsonDb.monitors.update(parseInt(id), data);
        if (!updated) {
            return reply.code(404).send({ error: 'Monitor not found' });
        }
        if (data.interval !== undefined || data.url !== undefined || data.type !== undefined || data.port !== undefined) {
            try {
                await cancelMonitorSchedule(parseInt(id));
                await scheduleMonitorWithInterval(parseInt(id), data.interval || existing.interval, false);
            }
            catch (error) {
                console.error('Failed to reschedule monitor:', error);
            }
        }
        return reply.send(updated);
    });
    fastify.delete('/monitors/:id', async (request, reply) => {
        const { id } = request.params;
        const existing = jsonDb.monitors.findFirst(parseInt(id));
        if (!existing) {
            return reply.code(404).send({ error: 'Monitor not found' });
        }
        try {
            await cancelMonitorSchedule(parseInt(id));
        }
        catch (error) {
            console.error('Failed to cancel monitor schedule:', error);
        }
        jsonDb.monitors.delete(parseInt(id));
        return reply.code(204).send();
    });
    fastify.get('/monitors/:id/heartbeats', async (request, reply) => {
        const { id } = request.params;
        const { limit = '1440' } = request.query;
        const heartbeats = jsonDb.heartbeats.findMany(parseInt(id), parseInt(limit) || 1440);
        return reply.send(heartbeats);
    });
    fastify.post('/monitors/:id/test', async (request, reply) => {
        const { id } = request.params;
        const monitor = jsonDb.monitors.findFirst(parseInt(id));
        if (!monitor) {
            return reply.code(404).send({ error: 'Monitor not found' });
        }
        try {
            const result = await executeSingleCheck(monitor.type, monitor.url, monitor.port, monitor.timeout, monitor.keyword, monitor.expectedStatus);
            return reply.send(result);
        }
        catch (error) {
            return reply.code(500).send({ error: error.message || 'Failed to run test' });
        }
    });
    fastify.post('/monitors/test-connection', async (request, reply) => {
        const data = testConnectionSchema.parse(request.body);
        try {
            const result = await executeSingleCheck(data.type, data.url, data.port || null, data.timeout, data.keyword || null, data.expectedStatus || null);
            // If a webhookUrl is provided, send a test message to it
            let webhookResult;
            if (data.webhookUrl && data.webhookUrl.length > 0) {
                try {
                    const emoji = result.up ? '✅' : '🔴';
                    const statusText = result.up ? 'ONLINE' : 'OFFLINE';
                    const msgText = `🧪 *Monserv Test Alert*\nThis is a test notification from Monserv.\n\nTarget: ${data.url}\nProtocol: ${data.type.toUpperCase()}\nResult: ${emoji} ${statusText}\nLatency: ${result.latency}ms\nDetails: ${result.message}\nTime: ${new Date().toISOString()}`;
                    const isDiscord = data.webhookUrl.toLowerCase().includes('discord.com');
                    await axios.post(data.webhookUrl, isDiscord ? { content: msgText } : { text: msgText }, { timeout: 10000 });
                    webhookResult = { sent: true };
                    console.log(`[WEBHOOK TEST] Test message sent to ${data.webhookUrl}`);
                }
                catch (err) {
                    webhookResult = { sent: false, error: err?.message || 'Failed to send test webhook' };
                    console.error(`[WEBHOOK TEST ERROR]:`, err?.message);
                }
            }
            return reply.send({ ...result, webhookResult });
        }
        catch (error) {
            return reply.code(500).send({ error: error.message || 'Failed to run connection test' });
        }
    });
}
