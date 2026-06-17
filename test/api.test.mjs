import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

describe('api', () => {
  let mod;

  before(async () => {
    mod = await import('../src/api.mjs');
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
});
