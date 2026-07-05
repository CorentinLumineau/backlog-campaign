import { describe, expect, test } from 'bun:test';
import {
  extractPrLinks,
  extractSizeLabel,
  filterIssuesForScope,
  issueVisibleInScope,
  parseEpicParent,
  scopeKey,
} from './forge-sync';

describe('parseEpicParent', () => {
  test('extracts epic parent from body line', () => {
    expect(parseEpicParent('## Context\nPart of #298\n')).toBe(298);
  });

  test('returns null when absent', () => {
    expect(parseEpicParent('No epic link')).toBeNull();
  });
});

describe('extractPrLinks', () => {
  test('finds fixes and closes keywords', () => {
    expect(extractPrLinks('This fixes #42 and closes #43')).toEqual([42, 43]);
  });
});

describe('extractSizeLabel', () => {
  test('returns first size: label', () => {
    expect(
      extractSizeLabel([{ name: 'bug' }, { name: 'size:m' }], 'size:'),
    ).toBe('size:m');
  });
});

describe('scopeKey', () => {
  test('serializes milestone and sorted labels', () => {
    expect(scopeKey({ milestone: 'v0.5.0', labels: ['b', 'a'] })).toBe('v0.5.0|a,b');
  });
});

describe('issueVisibleInScope', () => {
  const scope = { milestone: 'v0.5.0' };

  test('shows in-scope completed issue', () => {
    expect(
      issueVisibleInScope({ status: 'merged', scope_milestone: 'v0.5.0' }, scope),
    ).toBe(true);
  });

  test('hides prior-scope completed issue', () => {
    expect(
      issueVisibleInScope({ status: 'merged', scope_milestone: 'v0.4.2' }, scope),
    ).toBe(false);
  });

  test('always shows active work even without scope tag', () => {
    expect(issueVisibleInScope({ status: 'in-flight', phase: 'plan' }, scope)).toBe(true);
  });

  test('shows all when unscoped', () => {
    expect(
      issueVisibleInScope({ status: 'merged', scope_milestone: 'v0.4.2' }, {}),
    ).toBe(true);
  });
});

describe('filterIssuesForScope', () => {
  test('counts hidden done from prior scope', () => {
    const { visible, hiddenDoneCount } = filterIssuesForScope(
      {
        '23': { status: 'merged', scope_milestone: 'v0.4.2' },
        '28': { status: 'merged', scope_milestone: 'v0.5.0' },
        '29': { status: 'ready', scope_milestone: 'v0.5.0' },
      },
      { milestone: 'v0.5.0' },
    );

    expect(Object.keys(visible)).toEqual(['28', '29']);
    expect(hiddenDoneCount).toBe(1);
  });
});
