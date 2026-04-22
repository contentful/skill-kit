import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, cpSync, chmodSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Buildable } from '../types.js';
import { generateBunWrapper } from './bun-wrapper-template.js';
import { generateNodeWrapper } from './node-wrapper-template.js';
import { generateScriptsRun } from './scripts-run-template.js';
import { generateNodeScriptsRun } from './node-scripts-run-template.js';
import { generateSkillMd } from './skillmd-template.js';
import { generateReferenceMd } from './reference-md-template.js';
import { generatePackageJson } from './package-json-template.js';
import { resolveTargets, type BuildTarget } from './targets.js';

const exec = promisify(execFile);

export type BuildMode = 'bun' | 'node';

export interface BuildOptions {
  entry: string;
  outDir: string;
  targets?: string[];
  single?: boolean;
  mode?: BuildMode;
}

export interface BuildResult {
  outDir: string;
  binaries: string[];
  skillMd: string;
}

export async function buildSkill(opts: BuildOptions): Promise<BuildResult> {
  const entryPath = resolve(opts.entry);
  if (!existsSync(entryPath)) {
    throw new Error(`Entry file not found: ${entryPath}`);
  }

  const mod = await import(entryPath);
  const def: Buildable = mod.default;
  if (!def || (def.kind !== 'skill' && def.kind !== 'reference')) {
    throw new Error(`${entryPath} does not export a default skill or reference definition`);
  }

  const outDir = resolve(opts.outDir);
  const defName = def.name;
  const mode = opts.mode ?? 'bun';

  mkdirSync(join(outDir, 'scripts'), { recursive: true });
  mkdirSync(join(outDir, 'bin'), { recursive: true });

  const hasSubskills = def.kind === 'skill' && !!def.subskills && Object.keys(def.subskills).length > 0;

  const binaries =
    mode === 'node'
      ? await compileNodeBundle(entryPath, def, outDir, hasSubskills)
      : await compileBunBinaries(entryPath, def, outDir, opts, hasSubskills);

  if (binaries.length === 0) {
    throw new Error('No binaries were built successfully');
  }

  const runScript = mode === 'node' ? generateNodeScriptsRun(defName) : generateScriptsRun(defName);
  const runPath = join(outDir, 'scripts', 'run');
  writeFileSync(runPath, runScript);
  chmodSync(runPath, 0o755);

  const skillMdContent = def.kind === 'reference' ? generateReferenceMd(def) : generateSkillMd(def);
  const skillMdPath = join(outDir, 'SKILL.md');
  writeFileSync(skillMdPath, skillMdContent);

  const pkgJson = generatePackageJson(defName, def.version);
  writeFileSync(join(outDir, 'package.json'), pkgJson);

  const refsDir = join(dirname(entryPath), 'references');
  if (existsSync(refsDir)) {
    cpSync(refsDir, join(outDir, 'references'), { recursive: true });
  }

  const stats = binaries.map((b) => `  ${basename(b)}`).join('\n');
  process.stderr.write(`\nBuild complete:\n${stats}\n`);

  return { outDir, binaries, skillMd: skillMdPath };
}

async function compileBunBinaries(
  entryPath: string,
  def: Buildable,
  outDir: string,
  opts: BuildOptions,
  hasSubskills: boolean,
): Promise<string[]> {
  try {
    await exec('bun', ['--version']);
  } catch {
    throw new Error('bun is not installed. Install it from https://bun.sh to build skill executables.');
  }

  const wrapperContent = generateBunWrapper(entryPath, def.kind, hasSubskills);
  const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const wrapperPath = join(sdkRoot, `.skill-kit-build-${def.name}.ts`);
  writeFileSync(wrapperPath, wrapperContent);

  const targets = opts.single ? [getCurrentTarget()] : resolveTargets(opts.targets);
  const binaries: string[] = [];

  for (const target of targets) {
    const binPath = join(outDir, 'bin', `${def.name}-${target.name}`);
    process.stderr.write(`Building ${target.name}...\n`);

    try {
      await exec('bun', ['build', '--compile', '--target', target.bunTarget, wrapperPath, '--outfile', binPath]);
      binaries.push(binPath);
      process.stderr.write(`  ✓ ${binPath}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ✗ ${target.name}: ${message}\n`);
    }
  }

  try {
    unlinkSync(wrapperPath);
  } catch {}

  return binaries;
}

async function compileNodeBundle(
  entryPath: string,
  def: Buildable,
  outDir: string,
  hasSubskills: boolean,
): Promise<string[]> {
  const esbuild = await import('esbuild');

  const wrapperContent = generateNodeWrapper(entryPath, def.kind, hasSubskills);
  const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const wrapperPath = join(sdkRoot, `.skill-kit-build-${def.name}.ts`);
  writeFileSync(wrapperPath, wrapperContent);

  const bundlePath = join(outDir, 'bin', `${def.name}.mjs`);
  process.stderr.write(`Bundling for Node.js...\n`);

  try {
    await esbuild.build({
      entryPoints: [wrapperPath],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      outfile: bundlePath,
      treeShaking: true,
      minify: true,
    });
    process.stderr.write(`  ✓ ${bundlePath}\n`);
  } finally {
    try {
      unlinkSync(wrapperPath);
    } catch {}
  }

  return [bundlePath];
}

function getCurrentTarget(): BuildTarget {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return {
    name: `${platform}-${arch}`,
    bunTarget: `bun-${platform}-${arch}`,
  };
}
