import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { parseDependsFromBody } from './forge-deps';
import {
  readScope,
  buildListArgs,
  issueMatchesScope,
  type CampaignScope,
} from './forge-scope';

const root = path.resolve(import.meta.dirname, '..');

export type QueueIssue = {
  title?: string;
  phase?: string;
  status?: string;
  depends_on?: number[];
  blocks?: number[];
  worktree?: string | null;
  pr?: number | null;
  migration_slot?: boolean;
  touch_paths?: string[];
  size?: string | null;
  epic_parent?: number | null;
  review_iteration?: number;
  notes?: string | null;
  scope_milestone?: string | null;
  scope_labels?: string[];
};

export type QueueJson = {
  refreshed_at?: string;
  campaign_started_at?: string;
  active_scope?: CampaignScope;
  user_queue_order?: number[];
  issues?: Record<string, QueueIssue>;
};

export type ForgeIssueRow = {
  number: number;
  title: string;
  labels: { name: string }[];
  body: string;
  milestone: { title: string } | null;
  state: 'OPEN' | 'CLOSED';
};

export type ForgePrRow = {
  number: number;
  title: string;
  headRefName: string;
  body: string;
  state: string;
};

export type SyncResult = {
  ok: boolean;
  error?: string;
  summary?: string;
  newIssues: number[];
  openCount: number;
};

type CampaignConfig = {
  repo?: string;
  auto_sync?: boolean;
  scope_milestone?: string;
  scope_labels?: string[];
  size_label_prefix?: string;
  default_touch_paths?: string[];
};

const EPIC_PARENT_RE = /^part of\s+#(\d+)/i;
const PR_LINK_RE = /(?:fixes|closes|resolves)\s+#(\d+)/gi;

export function parseEpicParent(body: string): number | null {
  for (const line of body.split('\n')) {
    const match = line.trim().match(EPIC_PARENT_RE);
    if (match) return Number(match[1]);
  }
  return null;
}

export function extractPrLinks(text: string): number[] {
  const seen = new Set<number>();
  const nums: number[] = [];
  for (const match of text.matchAll(PR_LINK_RE)) {
    const n = Number(match[1]);
    if (!seen.has(n)) {
      seen.add(n);
      nums.push(n);
    }
  }
  return nums;
}

export function extractSizeLabel(
  labels: { name: string }[],
  prefix = 'size:',
): string | null {
  for (const label of labels) {
    if (label.name.startsWith(prefix)) return label.name;
  }
  return null;
}

export function scopeKey(scope: CampaignScope): string {
  const milestone = scope.milestone ?? '';
  const labels = (scope.labels ?? []).slice().sort().join(',');
  return `${milestone}|${labels}`;
}

export function issueVisibleInScope(issue: QueueIssue, scope: CampaignScope): boolean {
  const hasScope = Boolean(scope.milestone) || Boolean(scope.labels?.length);
  if (!hasScope) return true;

  const active = ['in-flight', 'blocked', 'ready'].includes(issue.status ?? '');
  if (active) return true;

  if (scope.milestone) {
    if (issue.scope_milestone === scope.milestone) return true;
    return false;
  }

  if (scope.labels?.length) {
    const issueLabels = new Set(issue.scope_labels ?? []);
    return scope.labels.every((l) => issueLabels.has(l));
  }

  return true;
}

export function filterIssuesForScope(
  issues: Record<string, QueueIssue>,
  scope: CampaignScope,
): { visible: Record<string, QueueIssue>; hiddenDoneCount: number } {
  const visible: Record<string, QueueIssue> = {};
  let hiddenDoneCount = 0;

  for (const [num, issue] of Object.entries(issues)) {
    if (issueVisibleInScope(issue, scope)) {
      visible[num] = issue;
    } else if (['merged', 'closed'].includes(issue.status ?? '')) {
      hiddenDoneCount++;
    }
  }

  return { visible, hiddenDoneCount };
}

function ghJson<T>(args: string[], repo: string): { ok: true; data: T } | { ok: false; error: string } {
  const result = spawnSync('gh', [...args, '--repo', repo], {
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr?.trim() || result.stdout?.trim() || 'gh command failed',
    };
  }

  try {
    return { ok: true, data: JSON.parse(result.stdout || 'null') as T };
  } catch {
    return { ok: false, error: 'invalid gh JSON response' };
  }
}

function ghAuthOk(): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8', stdio: 'pipe' });
  return result.status === 0;
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function defaultQueue(scope: CampaignScope): QueueJson {
  return {
    refreshed_at: new Date().toISOString(),
    campaign_started_at: new Date().toISOString(),
    active_scope: scope,
    user_queue_order: [],
    issues: {},
  };
}

function ingestIssue(
  forgeIssue: ForgeIssueRow,
  config: CampaignConfig,
  scope: CampaignScope,
): QueueIssue {
  const sizePrefix = config.size_label_prefix ?? 'size:';
  return {
    title: forgeIssue.title,
    phase: 'handle',
    status: 'ready',
    depends_on: parseDependsFromBody(forgeIssue.body),
    blocks: [],
    worktree: null,
    pr: null,
    migration_slot: false,
    touch_paths: config.default_touch_paths ?? ['src/**', 'lib/**', 'app/**'],
    size: extractSizeLabel(forgeIssue.labels, sizePrefix),
    epic_parent: parseEpicParent(forgeIssue.body),
    review_iteration: 0,
    notes: 'auto-sync ingest',
    scope_milestone: scope.milestone ?? null,
    scope_labels: scope.labels ? [...scope.labels] : undefined,
  };
}

function buildPrByIssueMap(prs: ForgePrRow[]): Map<number, ForgePrRow> {
  const map = new Map<number, ForgePrRow>();
  for (const pr of prs) {
    const text = `${pr.body}\n${pr.headRefName}`;
    for (const issueNum of extractPrLinks(text)) {
      if (!map.has(issueNum)) map.set(issueNum, pr);
    }
  }
  return map;
}

function reconcileIssueWithPr(
  issueNum: number,
  issue: QueueIssue,
  forgeIssue: ForgeIssueRow | null,
  prByIssue: Map<number, ForgePrRow>,
): void {
  if (!forgeIssue) return;

  issue.title = forgeIssue.title;
  issue.size = extractSizeLabel(forgeIssue.labels);
  issue.depends_on = parseDependsFromBody(forgeIssue.body);
  issue.epic_parent = parseEpicParent(forgeIssue.body);

  if (forgeIssue.state === 'CLOSED') {
    if (issue.status !== 'in-flight') {
      issue.status = 'merged';
      issue.phase = 'done';
    }
    return;
  }

  const linkedPr = prByIssue.get(issueNum);
  if (linkedPr) {
    issue.pr = linkedPr.number;
    if (issue.status === 'in-flight' && issue.phase === 'implement') {
      issue.phase = 'review';
    }
  }
}

function fetchIssueView(repo: string, issueNum: number): ForgeIssueRow | null {
  const res = ghJson<ForgeIssueRow>(
    [
      'issue',
      'view',
      String(issueNum),
      '--json',
      'number,title,labels,body,milestone,state',
    ],
    repo,
  );
  return res.ok ? res.data : null;
}

function formatScopeClause(scope: CampaignScope): string {
  if (scope.milestone) return `milestone ${scope.milestone}`;
  if (scope.labels?.length) return `labels ${scope.labels.join(',')}`;
  return 'unscoped';
}

export function runForgeSync(
  campaignDir: string,
  opts: { quiet?: boolean } = {},
): SyncResult {
  const configPath = path.join(campaignDir, 'config.json');
  const queuePath = path.join(campaignDir, 'queue.json');

  if (!fs.existsSync(configPath)) {
    return { ok: false, error: 'config.json not found', newIssues: [], openCount: 0 };
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as CampaignConfig;
  if (config.auto_sync === false) {
    return { ok: true, summary: 'skipped (auto_sync: false)', newIssues: [], openCount: 0 };
  }

  const repo = config.repo;
  if (!repo) {
    return { ok: false, error: 'config.repo missing', newIssues: [], openCount: 0 };
  }

  if (!ghAuthOk()) {
    return { ok: false, error: 'gh auth failed — run `gh auth login`', newIssues: [], openCount: 0 };
  }

  const scope = readScope(config);
  let queue: QueueJson;

  if (fs.existsSync(queuePath)) {
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8')) as QueueJson;
  } else {
    queue = defaultQueue(scope);
  }

  if (!queue.issues) queue.issues = {};
  if (!queue.user_queue_order) queue.user_queue_order = [];

  const listArgs = buildListArgs(scope);
  const openRes = ghJson<ForgeIssueRow[]>(
    [
      'issue',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,labels,body,milestone,state',
      '--limit',
      '200',
      ...listArgs,
    ],
    repo,
  );

  if (!openRes.ok) {
    return { ok: false, error: openRes.error, newIssues: [], openCount: 0 };
  }

  const openIssues = openRes.data;
  const openMap = new Map(openIssues.map((i) => [i.number, i]));

  const prRes = ghJson<ForgePrRow[]>(
    ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,body,state', '--limit', '100'],
    repo,
  );
  const openPrs = prRes.ok ? prRes.data : [];
  const prByIssue = buildPrByIssueMap(openPrs);

  const newIssues: number[] = [];
  const priorScopeKey = scopeKey(queue.active_scope ?? {});
  const nextScopeKey = scopeKey(scope);

  for (const forgeIssue of openIssues) {
    if (!issueMatchesScope(forgeIssue, scope)) continue;

    const key = String(forgeIssue.number);
    if (!queue.issues[key]) {
      queue.issues[key] = ingestIssue(forgeIssue, config, scope);
      if (!queue.user_queue_order.includes(forgeIssue.number)) {
        queue.user_queue_order.push(forgeIssue.number);
      }
      newIssues.push(forgeIssue.number);
    }
  }

  for (const [numStr, issue] of Object.entries(queue.issues)) {
    const num = Number(numStr);
    const isDone = ['merged', 'closed'].includes(issue.status ?? '');
    const inCurrentScope = issueVisibleInScope(issue, scope);

    if (isDone && !inCurrentScope && priorScopeKey !== nextScopeKey) {
      continue;
    }

    const forgeIssue = openMap.get(num) ?? fetchIssueView(repo, num);
    if (forgeIssue) {
      reconcileIssueWithPr(num, issue, forgeIssue, prByIssue);
      if (!issue.scope_milestone && scope.milestone) {
        issue.scope_milestone = forgeIssue.milestone?.title ?? null;
      }
      if (!issue.scope_labels && scope.labels?.length) {
        issue.scope_labels = forgeIssue.labels.map((l) => l.name).filter((n) =>
          scope.labels!.includes(n),
        );
      }
    } else if (!isDone && inCurrentScope) {
      const viewed = fetchIssueView(repo, num);
      if (viewed) {
        reconcileIssueWithPr(num, issue, viewed, prByIssue);
      }
    }
  }

  queue.active_scope = scope;
  queue.refreshed_at = new Date().toISOString();
  if (!queue.campaign_started_at) {
    queue.campaign_started_at = queue.refreshed_at;
  }

  fs.mkdirSync(campaignDir, { recursive: true });
  writeJsonAtomic(queuePath, queue);

  const scopeChanged = priorScopeKey !== nextScopeKey && priorScopeKey !== '|';
  const parts: string[] = [];
  if (newIssues.length > 0) {
    parts.push(`+${newIssues.length} new (#${newIssues.join(', #')})`);
  }
  if (scopeChanged) {
    parts.push('scope reconciled');
  }

  const summary =
    parts.length > 0
      ? `Forge sync (scope: ${formatScopeClause(scope)}): ${openIssues.length} open, ${parts.join(', ')}`
      : undefined;

  if (summary && !opts.quiet) {
    console.log(summary);
  }

  return {
    ok: true,
    summary,
    newIssues,
    openCount: openIssues.length,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  let campaignDir = path.join(root, '.bc-campaign');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--campaign-dir' && args[i + 1]) {
      campaignDir = path.isAbsolute(args[i + 1])
        ? args[i + 1]
        : path.join(root, args[i + 1]);
      i++;
    }
  }

  const result = runForgeSync(campaignDir);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.summary) {
    console.log(result.summary);
  }
}

if (import.meta.main) {
  main();
}
