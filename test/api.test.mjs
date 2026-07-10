import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

describe('api', () => {
  /** @type {any} */
  let mod;
  let origFetch;
  let origUrl, origToken, origAuth;

  before(async () => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    origAuth = process.env.SONARQUBE_AUTH_SCHEME;
    process.env.SONARQUBE_URL = 'http://test:9000';
    process.env.SONARQUBE_TOKEN = 'squ_testtoken';
    mod = await import('../src/api.mjs');
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
    process.env.SONARQUBE_AUTH_SCHEME = origAuth;
    if (origFetch) globalThis.fetch = origFetch;
  });

  it('exports resolveProjectKey', () => {
    assert.equal(typeof mod.resolveProjectKey, 'function');
  });

  it('resolveProjectKey uses argument first', () => {
    assert.equal(mod.resolveProjectKey({ projectKey: 'foo' }), 'foo');
  });

  it('resolveProjectKey falls back to DEFAULT_PROJECT', () => {
    const prev = process.env.SONARQUBE_PROJECT;
    process.env.SONARQUBE_PROJECT = 'bar';
    assert.equal(mod.resolveProjectKey({}), 'bar');
    process.env.SONARQUBE_PROJECT = prev;
  });

  it('resolveProjectKey throws when no default', () => {
    const prev = process.env.SONARQUBE_PROJECT;
    delete process.env.SONARQUBE_PROJECT;
    assert.throws(() => mod.resolveProjectKey({}), /projectKey required/);
    process.env.SONARQUBE_PROJECT = prev;
  });

  it('exports orgQuery', () => {
    assert.equal(mod.orgQuery(), '');
  });

  it('orgQuery includes organization when set', () => {
    const prev = process.env.SONARQUBE_ORGANIZATION;
    process.env.SONARQUBE_ORGANIZATION = 'myorg';
    assert.match(mod.orgQuery(), /organization=myorg/);
    process.env.SONARQUBE_ORGANIZATION = prev;
  });

  it('maybeTruncated sets _truncated when total > pageSize', () => {
    const data = { paging: { total: 50, pageSize: 30 } };
    mod.maybeTruncated(data);
    assert.equal(data._truncated, true);
  });

  it('maybeTruncated does not set _truncated when total <= pageSize', () => {
    const data = { paging: { total: 10, pageSize: 30 } };
    mod.maybeTruncated(data);
    assert.equal(data._truncated, false);
  });

  it('maybeTruncated returns data unchanged without paging', () => {
    const data = { foo: 'bar' };
    const result = mod.maybeTruncated(data);
    assert.equal(result, data);
    assert.equal(result._truncated, undefined);
  });

  it('sonarGet succeeds and returns parsed JSON', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.ok(url.startsWith('http://test:9000/api/test'));
      return { ok: true, status: 200, text: async () => '{"hello":"world"}' };
    };
    const result = await mod.sonarGet('/api/test');
    assert.deepEqual(result, { hello: 'world' });
    globalThis.fetch = origFetch;
  });

  it('sonarGet returns plain text when JSON parse fails', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => 'plain text response',
    });
    const result = await mod.sonarGet('/api/test');
    assert.equal(result, 'plain text response');
    globalThis.fetch = origFetch;
  });

  it('sonarGet throws when fetch fails (network error)', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(
      () => mod.sonarGet('/api/test'),
      /Cannot reach SonarQube/,
    );
    globalThis.fetch = origFetch;
  });

  it('sonarPost succeeds and returns parsed JSON', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      assert.equal(opts.method, 'POST');
      assert.match(opts.headers.authorization, /^Basic /);
      assert.equal(
        opts.headers['Content-Type'],
        'application/x-www-form-urlencoded',
      );
      return { ok: true, status: 200, text: async () => '{"success":true}' };
    };
    const result = await mod.sonarPost('/api/test', 'key=val');
    assert.deepEqual(result, { success: true });
    globalThis.fetch = origFetch;
  });

  it('sonarPost throws on non-ok response', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => '{"errors":[{"msg":"Bad"}]}',
    });
    await assert.rejects(
      () => mod.sonarPost('/api/test', 'key=val'),
      /SonarQube 400/,
    );
    globalThis.fetch = origFetch;
  });

  it('sonarPost throws on non-ok with plain text', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    await assert.rejects(
      () => mod.sonarPost('/api/test', 'key=val'),
      /SonarQube 400: Bad Request/,
    );
    globalThis.fetch = origFetch;
  });

  it('sonarGet throws without token', async () => {
    const prev = process.env.SONARQUBE_TOKEN;
    delete process.env.SONARQUBE_TOKEN;
    await assert.rejects(
      () => mod.sonarGet('/api/test'),
      /SONARQUBE_TOKEN is not set/,
    );
    process.env.SONARQUBE_TOKEN = prev;
  });

  it('sonarPost throws without token', async () => {
    const prev = process.env.SONARQUBE_TOKEN;
    delete process.env.SONARQUBE_TOKEN;
    await assert.rejects(
      () => mod.sonarPost('/api/test', 'key=val'),
      /SONARQUBE_TOKEN is not set/,
    );
    process.env.SONARQUBE_TOKEN = prev;
  });

  it('sonarCheckServer returns health when reachable', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ health: 'GREEN' }),
      text: async () => '{"health":"GREEN"}',
    });
    const result = await mod.sonarCheckServer();
    assert.equal(result.reachable, true);
    assert.equal(result.health, 'GREEN');
    globalThis.fetch = origFetch;
  });

  it('sonarCheckServer returns status when not ok', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      json: async () => {
        throw new Error('not json');
      },
    });
    const result = await mod.sonarCheckServer();
    assert.equal(result.reachable, true);
    assert.equal(result.status, 503);
    globalThis.fetch = origFetch;
  });

  it('sonarCheckServer returns hint on network error', async () => {
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('fetch failed');
    };
    const result = await mod.sonarCheckServer();
    assert.equal(result.reachable, false);
    assert.ok(result.hint);
    globalThis.fetch = origFetch;
  });

  it('instanceHint mentions Docker for localhost', async () => {
    const prevUrl = process.env.SONARQUBE_URL;
    process.env.SONARQUBE_URL = 'http://localhost:9000';
    // Fresh import to pick up new env
    const freshMod = await import('../src/api.mjs');
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('refused');
    };
    const result = await freshMod.sonarCheckServer();
    assert.match(result.hint, /docker/i);
    globalThis.fetch = origFetch;
    process.env.SONARQUBE_URL = prevUrl;
  });

  it('instanceHint mentions invalid URL for malformed URL', async () => {
    const prevUrl = process.env.SONARQUBE_URL;
    process.env.SONARQUBE_URL = 'not a url at all';
    const freshMod = await import('../src/api.mjs');
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('refused');
    };
    const result = await freshMod.sonarCheckServer();
    assert.match(result.hint, /not a valid URL/);
    globalThis.fetch = origFetch;
    process.env.SONARQUBE_URL = prevUrl;
  });

  it('authHeader uses bearer scheme when configured', async () => {
    const prevAuth = process.env.SONARQUBE_AUTH_SCHEME;
    process.env.SONARQUBE_AUTH_SCHEME = 'bearer';
    const freshMod = await import('../src/api.mjs');
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      assert.match(opts.headers.authorization, /^Bearer /);
      return { ok: true, status: 200, text: async () => '{}' };
    };
    await freshMod.sonarGet('/api/test');
    globalThis.fetch = origFetch;
    process.env.SONARQUBE_AUTH_SCHEME = prevAuth;
  });

  it('exports getHostUrl', () => {
    assert.equal(typeof mod.getHostUrl, 'function');
  });

  it('getHostUrl strips trailing slash', () => {
    const prev = process.env.SONARQUBE_URL;
    process.env.SONARQUBE_URL = 'http://example.com/';
    assert.equal(mod.getHostUrl(), 'http://example.com');
    process.env.SONARQUBE_URL = prev;
  });

  it('exports log function', () => {
    assert.equal(typeof mod.log, 'function');
  });
});
