import { describe, expect, test } from 'bun:test';
import { aggregateReview, paretoPriority, type Finding } from './review-aggregate';

const baseFinding = (overrides: Partial<Finding> = {}): Finding => ({
  vcode: 'V-KISS-03',
  severity: 'WARN',
  file: 'src/a.ts',
  line: 10,
  summary: 'issue',
  ...overrides,
});

describe('aggregateReview', () => {
  test('empty findings → lgtm true, approved', () => {
    const result = aggregateReview({
      reviewer: { status: 'complete', findings: [] },
      issueRef: '46',
    });
    expect(result.status).toBe('approved');
    expect(result.lgtm).toBe(true);
    expect(result.blockers_count).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.pareto_candidates).toEqual([]);
  });

  test('BLOCK finding → lgtm false, changes_requested', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', vcode: 'V-SCOPE-02' })],
      },
      issueRef: '46',
    });
    expect(result.status).toBe('changes_requested');
    expect(result.lgtm).toBe(false);
    expect(result.blockers_count).toBe(1);
    expect(result.findings).toHaveLength(1);
  });

  test('V-DOC-02/04 BLOCK finding → dedups and gates like any other BLOCK vcode', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', vcode: 'V-DOC-02/04' })],
      },
      issueRef: '46',
    });
    expect(result.status).toBe('changes_requested');
    expect(result.lgtm).toBe(false);
    expect(result.blockers_count).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].vcode).toBe('V-DOC-02/04');
  });

  test('dedup keeps highest severity for same key', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [
          baseFinding({ severity: 'WARN', summary: 'low' }),
          baseFinding({ severity: 'BLOCK', summary: 'high' }),
        ],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('BLOCK');
    expect(result.findings[0].summary).toBe('high');
    expect(result.blockers_count).toBe(1);
  });

  test('dedup merges prior findings with reviewer output', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ line: 20, severity: 'WARN' })],
      },
      issueRef: '46',
      priorFindings: [baseFinding({ line: 10, severity: 'BLOCK' })],
    });
    expect(result.findings).toHaveLength(2);
    expect(result.blockers_count).toBe(1);
  });

  test('pareto_candidates sorted by priority descending', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [
          baseFinding({
            vcode: 'V-PARETO-02',
            severity: 'WARN',
            file: 'low.ts',
            line: 1,
            summary: 'low priority',
            gain: 3,
            effort: 8,
          }),
          baseFinding({
            vcode: 'V-PARETO-02',
            severity: 'WARN',
            file: 'high.ts',
            line: 2,
            summary: 'high priority',
            gain: 9,
            effort: 2,
          }),
        ],
      },
      issueRef: '46',
    });
    expect(result.pareto_candidates).toHaveLength(2);
    expect(result.pareto_candidates[0].summary).toBe('high priority');
    expect(result.pareto_candidates[0].priority).toBe(81);
    expect(result.pareto_candidates[1].priority).toBe(9);
  });

  test('V-ADA-01 findings on same file, different issue_ref → not deduped by aggregator', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [
          baseFinding({ vcode: 'V-ADA-01', severity: 'WARN', issue_ref: '47' }),
        ],
      },
      issueRef: '46',
      priorFindings: [
        baseFinding({ vcode: 'V-ADA-01', severity: 'WARN', issue_ref: '46' }),
      ],
    });
    expect(result.findings).toHaveLength(2);
  });

  test('reviewer status error → aggregate error', () => {
    const result = aggregateReview({
      reviewer: { status: 'error', error: 'audit failed', findings: [] },
      issueRef: '46',
    });
    expect(result.status).toBe('error');
    expect(result.lgtm).toBe(false);
    expect(result.error).toBe('audit failed');
    expect(result.findings).toEqual([]);
  });
});

describe('paretoPriority', () => {
  test('computes gain * (11 - effort)', () => {
    expect(paretoPriority(7, 2)).toBe(63);
  });
});

describe('confidence gate', () => {
  test('confidence < 50 → finding dropped entirely', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', confidence: 49 })],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(0);
    expect(result.blockers_count).toBe(0);
  });

  test('confidence in [50, 80) with severity BLOCK → downgraded to WARN with caveat', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', confidence: 65 })],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('WARN');
    expect(result.findings[0].summary).toMatch(/confidence/i);
    expect(result.blockers_count).toBe(0);
  });

  test('confidence in [50, 80) with severity WARN → stays WARN, caveat added', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'WARN', confidence: 55, summary: 'low priority issue' })],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('WARN');
    expect(result.findings[0].summary).toMatch(/confidence/i);
    expect(result.findings[0].summary).toContain('low priority issue');
  });

  test('confidence >= 80 → passthrough unchanged, no caveat', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', confidence: 80, summary: 'high confidence issue' })],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('BLOCK');
    expect(result.findings[0].summary).toBe('high confidence issue');
    expect(result.blockers_count).toBe(1);
  });

  test('confidence absent (undefined) → full-confidence passthrough, unchanged behavior', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [baseFinding({ severity: 'BLOCK', summary: 'no confidence field' })],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('BLOCK');
    expect(result.findings[0].summary).toBe('no confidence field');
    expect(result.blockers_count).toBe(1);
  });

  test('finding with locations array (2+ entries) → dedup keys off top-level file/line only, locations preserved', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [
          baseFinding({
            severity: 'WARN',
            file: 'src/primary.ts',
            line: 5,
            locations: [
              { file: 'src/primary.ts', line: 5 },
              { file: 'src/other.ts', line: 22 },
            ],
          }),
        ],
      },
      issueRef: '46',
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('src/primary.ts');
    expect(result.findings[0].line).toBe(5);
    expect(result.findings[0].locations).toEqual([
      { file: 'src/primary.ts', line: 5 },
      { file: 'src/other.ts', line: 22 },
    ]);
  });

  test('existing V-PARETO-02 pareto-candidate tests continue to pass unmodified (no confidence field)', () => {
    const result = aggregateReview({
      reviewer: {
        status: 'complete',
        findings: [
          baseFinding({
            vcode: 'V-PARETO-02',
            severity: 'WARN',
            file: 'low.ts',
            line: 1,
            summary: 'low priority',
            gain: 3,
            effort: 8,
          }),
          baseFinding({
            vcode: 'V-PARETO-02',
            severity: 'WARN',
            file: 'high.ts',
            line: 2,
            summary: 'high priority',
            gain: 9,
            effort: 2,
          }),
        ],
      },
      issueRef: '46',
    });
    expect(result.pareto_candidates).toHaveLength(2);
    expect(result.pareto_candidates[0].summary).toBe('high priority');
    expect(result.pareto_candidates[0].priority).toBe(81);
    expect(result.pareto_candidates[1].priority).toBe(9);
  });
});
