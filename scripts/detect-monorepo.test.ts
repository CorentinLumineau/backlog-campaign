import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT_PATH = path.join(import.meta.dir, 'detect-monorepo.sh');

const makeFixtureDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'detect-monorepo-test-'));

const run = (fixtureDir: string) =>
  spawnSync('bash', [SCRIPT_PATH], { cwd: fixtureDir, encoding: 'utf-8' });

describe('detect-monorepo.sh', () => {
  test('pnpm-workspace.yaml + two packages -> monorepo=yes with packages line', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.writeFileSync(path.join(fixtureDir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf-8');
      fs.mkdirSync(path.join(fixtureDir, 'packages', 'a'), { recursive: true });
      fs.mkdirSync(path.join(fixtureDir, 'packages', 'b'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'packages', 'a', 'package.json'), '{}', 'utf-8');
      fs.writeFileSync(path.join(fixtureDir, 'packages', 'b', 'package.json'), '{}', 'utf-8');

      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines[0]).toBe('monorepo=yes');
      expect(lines[1]).toMatch(/^packages=/);
      expect(lines[1]).toContain('packages/a');
      expect(lines[1]).toContain('packages/b');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('go.work with use ( ... ) block -> monorepo=yes and packages=mod-a,mod-b', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.writeFileSync(
        path.join(fixtureDir, 'go.work'),
        'go 1.22\n\nuse (\n\t./mod-a\n\t./mod-b\n)\n',
        'utf-8'
      );

      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines[0]).toBe('monorepo=yes');
      expect(lines[1]).toBe('packages=mod-a,mod-b');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('no workspace config, but >=2 package dirs -> monorepo=yes (fallback heuristic)', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.mkdirSync(path.join(fixtureDir, 'packages', 'a'), { recursive: true });
      fs.mkdirSync(path.join(fixtureDir, 'packages', 'b'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'packages', 'a', 'package.json'), '{}', 'utf-8');
      fs.writeFileSync(path.join(fixtureDir, 'packages', 'b', 'package.json'), '{}', 'utf-8');

      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines[0]).toBe('monorepo=yes');
      expect(lines[1]).toMatch(/^packages=/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('single root package.json only -> monorepo=no, no packages line', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{}', 'utf-8');

      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe('monorepo=no');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('exit code is always 0, first line matches monorepo=(yes|no)', () => {
    const fixtureDir = makeFixtureDir();
    try {
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines[0]).toMatch(/^monorepo=(yes|no)$/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
