import { FastifyInstance } from 'fastify';
import { jsonDb } from '../db/jsonDb.js';
import { z } from 'zod';

const updateSettingsSchema = z.object({
  smtpHost: z.string().max(255).trim().optional().or(z.literal('')),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().max(255).trim().optional().or(z.literal('')),
  smtpPass: z.string().max(255).optional().or(z.literal('')),
  smtpFrom: z.string().max(255).trim().optional().or(z.literal('')),
  notificationEmail: z.string().max(255).trim().optional().or(z.literal('')),
});

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/settings', async (request, reply) => {
    const settings = jsonDb.settings.get();
    return reply.send(settings);
  });

  fastify.post('/settings', async (request, reply) => {
    const data = updateSettingsSchema.parse(request.body);
    const updated = jsonDb.settings.update(data);
    return reply.send(updated);
  });
}
