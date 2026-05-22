import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  hasStaleNextBuildArtifacts,
  resolveNextRuntimeMode,
} = require('../../src/lib/next-runtime.cjs');

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-next-runtime-'));
  tempRoots.push(root);
  return root;
}

describe('resolveNextRuntimeMode', () => {
  it('fails closed when NODE_ENV=production and build artifacts are missing', () => {
    const result = resolveNextRuntimeMode({
      nodeEnv: 'production',
      hasBuildArtifacts: false,
    });

    expect(result.dev).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.reason).toBe('missing-build-artifacts');
  });

  it('stays in production mode when build artifacts exist', () => {
    const result = resolveNextRuntimeMode({
      nodeEnv: 'production',
      hasBuildArtifacts: true,
    });

    expect(result.dev).toBe(false);
    expect(result.reason).toBe('production');
  });

  it('uses dev mode in non-production environments', () => {
    const result = resolveNextRuntimeMode({
      nodeEnv: 'development',
      hasBuildArtifacts: false,
    });

    expect(result.dev).toBe(true);
    expect(result.reason).toBe('non-production');
  });

  it('fails closed when NODE_ENV=production and build artifacts are stale', () => {
    const result = resolveNextRuntimeMode({
      nodeEnv: 'production',
      hasBuildArtifacts: true,
      hasStaleBuildArtifacts: true,
    });

    expect(result.dev).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.reason).toBe('stale-build-artifacts');
  });

  it('allows explicit local development fallback for missing production artifacts', () => {
    const result = resolveNextRuntimeMode({
      nodeEnv: 'production',
      hasBuildArtifacts: false,
      allowDevFallback: true,
    });

    expect(result.dev).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.reason).toBe('missing-build-artifacts-dev-fallback');
  });

  it('detects stale builds from tracked Next.js source paths', () => {
    const root = makeProjectRoot();
    const markerPath = path.join(root, '.next', 'BUILD_ID');
    const routeHandlerPath = path.join(root, 'app', 'api', 'health', 'route.ts');
    const componentPath = path.join(root, 'src', 'components', 'shell.tsx');
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.mkdirSync(path.dirname(routeHandlerPath), { recursive: true });
    fs.mkdirSync(path.dirname(componentPath), { recursive: true });
    fs.writeFileSync(markerPath, 'build');
    fs.writeFileSync(routeHandlerPath, 'export async function GET() {}');
    fs.writeFileSync(componentPath, 'export function Shell() { return null; }');
    const now = Date.now();
    fs.utimesSync(markerPath, new Date(now - 120_000), new Date(now - 120_000));
    fs.utimesSync(routeHandlerPath, new Date(now - 60_000), new Date(now - 60_000));
    fs.utimesSync(componentPath, new Date(now), new Date(now));

    expect(hasStaleNextBuildArtifacts({ rootDir: root, buildMarkerPath: markerPath })).toBe(true);
  });
});
