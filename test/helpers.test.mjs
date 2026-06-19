import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseIssueFacets } from '../src/helpers.mjs';

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
});
