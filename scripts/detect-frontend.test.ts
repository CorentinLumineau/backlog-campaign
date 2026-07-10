import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT_PATH = path.join(import.meta.dir, 'detect-frontend.sh');

const makeFixtureDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'detect-frontend-test-'));

const run = (fixtureDir: string) =>
  spawnSync('bash', [SCRIPT_PATH], { cwd: fixtureDir, encoding: 'utf-8' });

describe('detect-frontend.sh', () => {
  test('root package.json with a react dep -> frontend=yes', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.writeFileSync(
        path.join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'x', dependencies: { react: '^18.0.0' } }),
        'utf-8'
      );
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('frontend=yes\n');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('src/App.tsx present, no package.json signal -> frontend=yes', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, 'src', 'App.tsx'), 'export default function App() {}\n', 'utf-8');
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('frontend=yes\n');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('src/components/ dir only -> frontend=yes', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.mkdirSync(path.join(fixtureDir, 'src', 'components'), { recursive: true });
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('frontend=yes\n');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('tailwind.config.js only -> frontend=yes', () => {
    const fixtureDir = makeFixtureDir();
    try {
      fs.writeFileSync(path.join(fixtureDir, 'tailwind.config.js'), 'module.exports = {}\n', 'utf-8');
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('frontend=yes\n');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('empty fixture dir with no signals -> frontend=no', () => {
    const fixtureDir = makeFixtureDir();
    try {
      const result = run(fixtureDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('frontend=no\n');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('stdout is exactly one line matching frontend=(yes|no) in every case', () => {
    const fixtureDir = makeFixtureDir();
    try {
      const result = run(fixtureDir);
      const lines = result.stdout.split('\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(1);
      expect(lines[0]).toMatch(/^frontend=(yes|no)$/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
