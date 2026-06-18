import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import http from 'node:http';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

const token = process.env.SONARQUBE_TOKEN;

describe('http server', { skip: !token }, () => {
  let server;
  let baseUrl;

  after(() => {
    if (server) server.close();
  });

  it('starts and responds to health check', async () => {
    const { startHttpServer } = await import('../src/http-server.mjs');
    const prevHost = process.env.SONARQUBE_HTTP_HOST;
    const prevPort = process.env.SONARQUBE_HTTP_PORT;
    process.env.SONARQUBE_HTTP_HOST = '127.0.0.1';
    process.env.SONARQUBE_HTTP_PORT = '0';

    server = await startHttpServer(TOOL_CONFIGS);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.status);

    if (prevHost) process.env.SONARQUBE_HTTP_HOST = prevHost;
    else delete process.env.SONARQUBE_HTTP_HOST;
    if (prevPort) process.env.SONARQUBE_HTTP_PORT = prevPort;
    else delete process.env.SONARQUBE_HTTP_PORT;
  });

  it('lists tools', async () => {
    const res = await fetch(`${baseUrl}/tools`);
    assert.equal(res.status, 200);
    const tools = await res.json();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length > 0);
    assert.ok(tools[0].name);
    assert.ok(tools[0].description);
  });

  it('executes a tool via POST', async () => {
    const res = await fetch(`${baseUrl}/tools/sonar_ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.pong);
  });

  it('returns 404 for unknown tool', async () => {
    const res = await fetch(`${baseUrl}/tools/nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });

  it('returns 400 for invalid params', async () => {
    const res = await fetch(`${baseUrl}/tools/sonar_raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('handles CORS preflight', async () => {
    const res = await fetch(`${baseUrl}/tools`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get('access-control-allow-origin'));
  });

  it('returns 404 for unknown path', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    assert.equal(res.status, 404);
  });
});
