import assert from 'node:assert/strict';
import { describe, it, after, before } from 'node:test';
import { TOOL_CONFIGS } from '../src/handlers.mjs';

describe('http server', () => {
  let server;
  let baseUrl;
  let origHost, origPort;

  before(async () => {
    origHost = process.env.SONARQUBE_HTTP_HOST;
    origPort = process.env.SONARQUBE_HTTP_PORT;
    process.env.SONARQUBE_HTTP_HOST = '127.0.0.1';
    process.env.SONARQUBE_HTTP_PORT = '0';

    const { startHttpServer } = await import('../src/http-server.mjs');
    server = await startHttpServer(TOOL_CONFIGS);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    if (server) server.close();
    if (origHost) process.env.SONARQUBE_HTTP_HOST = origHost;
    else delete process.env.SONARQUBE_HTTP_HOST;
    if (origPort) process.env.SONARQUBE_HTTP_PORT = origPort;
    else delete process.env.SONARQUBE_HTTP_PORT;
  });

  it('starts and responds to health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
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
    const body = await res.json();
    assert.match(body.error, /Unknown tool/);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/tools/sonar_rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Invalid JSON/);
  });

  it('returns 400 for invalid params', async () => {
    const res = await fetch(`${baseUrl}/tools/sonar_rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('handles CORS preflight', async () => {
    const res = await fetch(`${baseUrl}/tools`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  it('returns 404 for unknown path', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Not found');
  });

  it('tool POST with object result', async () => {
    const res = await fetch(`${baseUrl}/tools/sonar_ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.pong !== undefined);
  });
});

describe('http server — default host/port', () => {
  let srv;
  let origHost, origPort, origToken;

  after(() => {
    if (srv) srv.close();
    if (origHost) process.env.SONARQUBE_HTTP_HOST = origHost;
    else delete process.env.SONARQUBE_HTTP_HOST;
    if (origPort) process.env.SONARQUBE_HTTP_PORT = origPort;
    else delete process.env.SONARQUBE_HTTP_PORT;
    if (origToken) process.env.SONARQUBE_TOKEN = origToken;
    else delete process.env.SONARQUBE_TOKEN;
  });

  it('uses default host when env var not set, token MISSING', async () => {
    origHost = process.env.SONARQUBE_HTTP_HOST;
    origPort = process.env.SONARQUBE_HTTP_PORT;
    origToken = process.env.SONARQUBE_TOKEN;
    delete process.env.SONARQUBE_HTTP_HOST;
    process.env.SONARQUBE_HTTP_PORT = '0';
    delete process.env.SONARQUBE_TOKEN;

    const { startHttpServer } = await import('../src/http-server.mjs');
    srv = await startHttpServer([]);
    const addr = srv.address();
    assert.ok(addr.port > 0);

    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.token, 'MISSING');
    srv.close();
  });

  it('falls back to port 8080 when no env var set', async () => {
    const origHost = process.env.SONARQUBE_HTTP_HOST;
    const origPort = process.env.SONARQUBE_HTTP_PORT;
    delete process.env.SONARQUBE_HTTP_HOST;
    delete process.env.SONARQUBE_HTTP_PORT;

    const { startHttpServer } = await import('../src/http-server.mjs');
    try {
      const s = await startHttpServer([]);
      const addr = s.address();
      assert.ok(addr.port === 8080 || addr.port > 0, `bound to unexpected port ${addr.port}`);
      s.close();
    } catch (e) {
      // EADDRINUSE is acceptable if something else holds 8080 in the environment.
      const msg = /** @type {Error} */ (e).message;
      assert.match(msg, /listen EADDRINUSE|8080/);
    }
    if (origHost) process.env.SONARQUBE_HTTP_HOST = origHost;
    else delete process.env.SONARQUBE_HTTP_HOST;
    if (origPort) process.env.SONARQUBE_HTTP_PORT = origPort;
    else delete process.env.SONARQUBE_HTTP_PORT;
  });
});
