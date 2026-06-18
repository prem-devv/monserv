// Set test DB path before importing jsonDb
import path from 'path';
import fs from 'fs';
process.env.DB_PATH = path.join(process.cwd(), 'test-db.json');

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { monitorRoutes } from './monitors.js';
import { statusRoutes } from './status.js';
import { ZodError } from 'zod';

let app: any;

before(async () => {
  // Clean up any stale test database
  if (fs.existsSync(process.env.DB_PATH!)) {
    fs.unlinkSync(process.env.DB_PATH!);
  }

  app = Fastify({ logger: false });
  
  app.setErrorHandler((error: any, request: any, reply: any) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.errors,
      });
    }
    return reply.status(error.statusCode || 500).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  });

  await app.register(monitorRoutes, { prefix: '/api' });
  await app.register(statusRoutes, { prefix: '/api' });
  await app.ready();
});

after(() => {
  // Clean up test database
  if (fs.existsSync(process.env.DB_PATH!)) {
    fs.unlinkSync(process.env.DB_PATH!);
  }
});

test('GET /api/status should return 200 and operational status', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/status',
  });

  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.ok('overallStatus' in body);
  assert.ok(Array.isArray(body.monitors));
});

test('GET /api/monitors should return empty array initially', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/monitors',
  });

  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.ok(Array.isArray(body));
  assert.strictEqual(body.length, 0);
});

test('POST /api/monitors should fail with empty/missing name', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/monitors',
    payload: {
      type: 'http',
      url: 'https://google.com',
    },
  });

  assert.strictEqual(response.statusCode, 400);
});

test('POST /api/monitors should fail with invalid port', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/monitors',
    payload: {
      name: 'Google',
      type: 'http',
      url: 'https://google.com',
      port: 999999, // Invalid port > 65535
    },
  });

  assert.strictEqual(response.statusCode, 400);
});

test('POST /api/monitors should create a monitor', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/monitors',
    payload: {
      name: 'Google Check',
      type: 'http',
      url: 'https://google.com',
      interval: 30,
      timeout: 10,
      isPublic: true,
    },
  });

  assert.strictEqual(response.statusCode, 201);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.name, 'Google Check');
  assert.strictEqual(body.type, 'http');
  assert.strictEqual(body.url, 'https://google.com');
  assert.strictEqual(body.interval, 30);
  assert.ok(body.id > 0);
});

test('GET /api/monitors should now list the created monitor', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/monitors',
  });

  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.length, 1);
  assert.strictEqual(body[0].name, 'Google Check');
});

test('PUT /api/monitors/:id should update name and interval', async () => {
  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/monitors',
  });
  const monitors = JSON.parse(listResponse.body);
  const monitorId = monitors[0].id;

  const updateResponse = await app.inject({
    method: 'PUT',
    url: `/api/monitors/${monitorId}`,
    payload: {
      name: 'Google Checked',
      interval: 45,
    },
  });

  assert.strictEqual(updateResponse.statusCode, 200);
  const body = JSON.parse(updateResponse.body);
  assert.strictEqual(body.name, 'Google Checked');
  assert.strictEqual(body.interval, 45);
});

test('DELETE /api/monitors/:id should delete monitor', async () => {
  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/monitors',
  });
  const monitors = JSON.parse(listResponse.body);
  const monitorId = monitors[0].id;

  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/monitors/${monitorId}`,
  });

  assert.strictEqual(deleteResponse.statusCode, 204);

  const checkResponse = await app.inject({
    method: 'GET',
    url: `/api/monitors/${monitorId}`,
  });
  assert.strictEqual(checkResponse.statusCode, 404);
});
