import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { monitorRoutes } from './routes/monitors.js';
import { statusRoutes } from './routes/status.js';
import { settingsRoutes } from './routes/settings.js';
import { scheduleAllMonitors } from './services/scheduler.js';
import { ZodError } from 'zod';
const fastify = Fastify({
    logger: true,
});
fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Validation failed',
            details: error.errors,
        });
    }
    fastify.log.error(error);
    return reply.status(error.statusCode || 500).send({
        error: error.name || 'InternalServerError',
        message: error.message || 'An unexpected error occurred',
    });
});
async function start() {
    try {
        await fastify.register(cors, {
            origin: true,
        });
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
        fastify.get('/health', async () => {
            return { status: 'ok', timestamp: Date.now() };
        });
        await fastify.register(monitorRoutes, { prefix: '/api' });
        await fastify.register(statusRoutes, { prefix: '/api' });
        await fastify.register(settingsRoutes, { prefix: '/api' });
        fastify.get('/api/health', async () => {
            return { status: 'ok', timestamp: Date.now() };
        });
        fastify.get('*', async (request, reply) => {
            return reply.code(404).send({ error: 'Not found' });
        });
        console.log('Starting monitor scheduler...');
        await scheduleAllMonitors();
        console.log('Monitors scheduled successfully');
        const port = parseInt(process.env.PORT || '3001');
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Server running at http://localhost:${port}`);
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
start();
// Reload trigger to fix race condition EADDRINUSE
