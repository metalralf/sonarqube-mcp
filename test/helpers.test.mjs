import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { z } from 'zod';
import { parseIssueFacets, componentParams, requireKey, encode } from '../src/helpers.mjs';

describe('helpers', () => {
  it('parseIssueFacets extracts non-zero counts', () => {
    const input = {
      facets: [
        { property: 'severities', values: [{ val: 'INFO', count: 3 }, { val: 'MINOR', count: 0 }] },
        { property: 'types', values: [{ val: 'CODE_SMELL', count: 3 }, { val: 'BUG', count: 0 }] },
      ],
    };
    const { bySeverity, byType } = parseIssueFacets(input);
    assert.deepEqual(bySeverity, { INFO: 3 });
    assert.deepEqual(byType, { CODE_SMELL: 3 });
  });

  it('parseIssueFacets handles empty facets', () => {
    const { bySeverity, byType } = parseIssueFacets(null);
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('parseIssueFacets handles missing facets', () => {
    const { bySeverity, byType } = parseIssueFacets({ facets: [] });
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('parseIssueFacets handles unknown facet properties gracefully', () => {
    const input = {
      facets: [
        { property: 'unknown_prop', values: [{ val: 'X', count: 5 }] },
      ],
    };
    const { bySeverity, byType } = parseIssueFacets(input);
    assert.deepEqual(bySeverity, {});
    assert.deepEqual(byType, {});
  });

  it('componentParams creates params with key only', () => {
    const params = componentParams('my-project:src/file.ts', undefined, undefined);
    assert.equal(params.get('key'), 'my-project:src/file.ts');
    assert.equal(params.get('from'), null);
    assert.equal(params.get('to'), null);
  });

  it('componentParams includes from and to when provided', () => {
    const params = componentParams('my-project:src/file.ts', 10, 50);
    assert.equal(params.get('from'), '10');
    assert.equal(params.get('to'), '50');
  });

  it('componentParams includes from only', () => {
    const params = componentParams('my-project:src/file.ts', 5, undefined);
    assert.equal(params.get('from'), '5');
    assert.equal(params.get('to'), null);
  });

  it('requireKey throws on falsy value', () => {
    assert.throws(() => requireKey(''), /component key/);
    assert.throws(() => requireKey(undefined), /component key/);
    assert.throws(() => requireKey(null), /component key/);
  });

  it('requireKey does not throw on valid key', () => {
    requireKey('my-project:src/file.ts');
  });

  it('encode wraps encodeURIComponent', () => {
    assert.equal(encode('hello world'), encodeURIComponent('hello world'));
    assert.equal(encode('a/b?c'), 'a%2Fb%3Fc');
  });
});

describe('helpers — measureSearch', () => {
  let origFetch, origUrl, origToken, origProject;

  before(() => {
    origUrl = process.env.SONARQUBE_URL;
    origToken = process.env.SONARQUBE_TOKEN;
    origProject = process.env.SONARQUBE_PROJECT;
    process.env.SONARQUBE_URL = 'http://test:9000';
    process.env.SONARQUBE_TOKEN = 'squ_testtoken';
    process.env.SONARQUBE_PROJECT = 'testproj';
  });

  after(() => {
    process.env.SONARQUBE_URL = origUrl;
    process.env.SONARQUBE_TOKEN = origToken;
    process.env.SONARQUBE_PROJECT = origProject;
    if (origFetch) globalThis.fetch = origFetch;
  });

  it('measureSearch returns sorted files below threshold (ascend)', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(url, /measures\/search/);
      return {
        ok: true, status: 200, text: async () => JSON.stringify({
          measures: [
            { metric: 'coverage', component: 'testproj:src/a.js', value: '75.0' },
            { metric: 'coverage', component: 'testproj:src/b.js', value: '90.0' },
            { metric: 'coverage', component: 'testproj:src/c.js', value: '50.0' },
          ],
        }),
      };
    };
    const result = await handler({ projectKey: 'testproj', threshold: 80 });
    assert.equal(result.total, 3);
    assert.equal(result.threshold, 80);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].coverage, 50);
    assert.equal(result.files[1].coverage, 75);
    globalThis.fetch = origFetch;
  });

  it('measureSearch returns sorted files above threshold (descend)', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('duplicated_lines_density', 'duplicatedLinesDensity', 3, true);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({
        measures: [
          { metric: 'duplicated_lines_density', component: 'testproj:src/a.js', value: '5.0' },
          { metric: 'duplicated_lines_density', component: 'testproj:src/b.js', value: '2.0' },
          { metric: 'duplicated_lines_density', component: 'testproj:src/c.js', value: '10.0' },
        ],
      }),
    });
    const result = await handler({ projectKey: 'testproj', threshold: 3 });
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].duplicatedLinesDensity, 10);
    assert.equal(result.files[1].duplicatedLinesDensity, 5);
    globalThis.fetch = origFetch;
  });

  it('measureSearch uses default threshold when not provided', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({ measures: [] }),
    });
    const result = await handler({ projectKey: 'testproj' });
    assert.equal(result.threshold, 80);
    globalThis.fetch = origFetch;
  });

  it('measureSearch filters out null values and project root', async () => {
    const { measureSearch } = await import('../src/helpers.mjs');
    const handler = measureSearch('coverage', 'coverage', 80, false);
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({
        measures: [
          { metric: 'coverage', component: 'testproj', value: '100.0' },
          { metric: 'coverage', component: 'testproj:src/a.js', value: '95.0' },
          { metric: 'coverage', component: 'testproj:src/b.js' },
        ],
      }),
    });
    const result = await handler({ projectKey: 'testproj', threshold: 80 });
    assert.equal(result.total, 1);
    assert.equal(result.files.length, 0);
    globalThis.fetch = origFetch;
  });
});

describe('helpers — tool and filterTools', () => {
  it('tool creates a ToolConfig object', async () => {
    const { tool } = await import('../src/helpers.mjs');
    const fn = () => 42;
    const result = tool('test_tool', 'Does stuff', { key: z.string() }, fn);
    assert.equal(result.name, 'test_tool');
    assert.equal(result.description, 'Does stuff');
    assert.equal(typeof result.handler, 'function');
    assert.equal(result.handler(), 42);
  });
});
