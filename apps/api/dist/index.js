import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { monitorRoutes } from './routes/monitors.js';
import { statusRoutes } from './routes/status.js';
import { settingsRoutes } from './routes/settings.js';
import { scheduleAllMonitors } from './services/scheduler.js';
import { jsonDb } from './db/jsonDb.js';
import { ZodError } from 'zod';
const isProduction = process.env.NODE_ENV === 'production';
const fastify = Fastify({
    logger: {
        level: isProduction ? 'info' : 'debug',
    },
    trustProxy: true, // required behind Caddy / reverse proxy
});
// ── Error handler ────────────────────────────────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Validation failed',
            details: error.errors,
        });
    }
    fastify.log.error(error);
    const err = error;
    return reply.status(err.statusCode || 500).send({
        error: err.name || 'InternalServerError',
        message: err.message || 'An unexpected error occurred',
    });
});
// ── Startup ──────────────────────────────────────────────────────────────
async function start() {
    try {
        // CORS — locked down in production, permissive for local dev
        await fastify.register(cors, {
            origin: isProduction
                ? [process.env.CORS_ORIGIN || 'http://localhost:3000']
                : true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
        });
        // Swagger docs (dev only)
        if (!isProduction) {
            await fastify.register(swagger, {
                openapi: {
                    info: {
                        title: 'Monserv API',
                        version: '1.0.0',
                    },
                },
            });
            await fastify.register(swaggerUi, {
                routePrefix: '/docs',
            });
        }
        // Health checks
        fastify.get('/health', async () => ({
            status: 'ok',
            timestamp: Date.now(),
        }));
        fastify.get('/api/health', async () => ({
            status: 'ok',
            timestamp: Date.now(),
        }));
        // Routes
        await fastify.register(monitorRoutes, { prefix: '/api' });
        await fastify.register(statusRoutes, { prefix: '/api' });
        await fastify.register(settingsRoutes, { prefix: '/api' });
        // Catch-all 404 for /api/*
        fastify.get('/api/*', async (_request, reply) => {
            return reply.code(404).send({ error: 'Not found' });
        });
        // Start scheduler
        console.log('Starting monitor scheduler...');
        await scheduleAllMonitors();
        console.log('Monitors scheduled successfully');
        const port = parseInt(process.env.PORT || '3001', 10);
        const host = '0.0.0.0';
        await fastify.listen({ port, host });
        console.log(`API server running at http://localhost:${port}`);
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
// ── Graceful shutdown ────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[SHUTDOWN] Received ${signal}, shutting down gracefully...`);
    try {
        await fastify.close();
        jsonDb.flushSync(); // ensure final DB state is on disk
        console.log('[SHUTDOWN] Server closed, database flushed.');
    }
    catch (err) {
        console.error('[SHUTDOWN] Error during shutdown:', err);
    }
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start();
