import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_METRIC_KEYS } from '../src/config.mjs';

describe('config', () => {
  it('DEFAULT_METRIC_KEYS is a comma-separated string of keys', () => {
    assert.ok(DEFAULT_METRIC_KEYS);
    assert.match(DEFAULT_METRIC_KEYS, /^bugs/);
    assert.ok(DEFAULT_METRIC_KEYS.includes('coverage'));
    assert.ok(DEFAULT_METRIC_KEYS.includes('ncloc'));
    assert.ok(DEFAULT_METRIC_KEYS.split(',').length >= 8);
  });
});
