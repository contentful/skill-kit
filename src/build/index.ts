import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, cpSync, chmodSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateBunWrapper } from './bun-wrapper-template.js';
import { generateScriptsRun } from './scripts-run-template.js';
import { generateSkillMd } from './skillmd-template.js';
import { generatePackageJson } from './package-json-template.js';
import { resolveTargets, type BuildTarget } from './targets.js';

const exec = promisify(execFile);

export interface BuildOptions {
  entry: string;
  outDir: string;
  targets?: string[];
  single?: boolean;
}

export interface BuildResult {
  outDir: string;
  binaries: string[];
  skillMd: string;
}

export async function buildSkill(opts: BuildOptions): Promise<BuildResult> {
  const entryPath = resolve(opts.entry);
  if (!existsSync(entryPath)) {
    throw new Error(`Skill entry file not found: ${entryPath}`);
  }

  // Dynamically import the skill to extract metadata
  const mod = await import(entryPath);
  const skill = mod.default;
  if (!skill || skill.kind !== 'skill') {
    throw new Error(`${entryPath} does not export a default skill definition`);
  }

  const outDir = resolve(opts.outDir);
  const skillName = skill.name as string;

  // Ensure output directories exist
  mkdirSync(join(outDir, 'scripts'), { recursive: true });
  mkdirSync(join(outDir, 'bin'), { recursive: true });

  // Check for bun
  try {
    await exec('bun', ['--version']);
  } catch {
    throw new Error(
      'bun is not installed. Install it from https://bun.sh to build skill executables.',
    );
  }

  // Generate bun wrapper
  const wrapperContent = generateBunWrapper(entryPath);
  const wrapperPath = join(tmpdir(), `skill-kit-build-${skillName}-${Date.now()}.ts`);
  writeFileSync(wrapperPath, wrapperContent);

  // Build targets
  const targets = opts.single ? [getCurrentTarget()] : resolveTargets(opts.targets);
  const binaries: string[] = [];

  for (const target of targets) {
    const binPath = join(outDir, 'bin', `${skillName}-${target.name}`);
    process.stderr.write(`Building ${target.name}...\n`);

    try {
      await exec('bun', [
        'build',
        '--compile',
        '--target',
        target.bunTarget,
        wrapperPath,
        '--outfile',
        binPath,
      ]);
      binaries.push(binPath);
      process.stderr.write(`  ✓ ${binPath}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ✗ ${target.name}: ${message}\n`);
    }
  }

  if (binaries.length === 0) {
    throw new Error('No binaries were built successfully');
  }

  // Generate scripts/run
  const runScript = generateScriptsRun(skillName);
  const runPath = join(outDir, 'scripts', 'run');
  writeFileSync(runPath, runScript);
  chmodSync(runPath, 0o755);

  // Generate SKILL.md
  const skillMdContent = generateSkillMd(skill);
  const skillMdPath = join(outDir, 'SKILL.md');
  writeFileSync(skillMdPath, skillMdContent);

  // Generate package.json
  const pkgJson = generatePackageJson(skillName, skill.version as string);
  writeFileSync(join(outDir, 'package.json'), pkgJson);

  // Copy references if they exist
  const refsDir = join(dirname(entryPath), 'references');
  if (existsSync(refsDir)) {
    cpSync(refsDir, join(outDir, 'references'), { recursive: true });
  }

  const stats = binaries.map((b) => `  ${basename(b)}`).join('\n');
  process.stderr.write(`\nBuild complete:\n${stats}\n`);

  return { outDir, binaries, skillMd: skillMdPath };
}

function getCurrentTarget(): BuildTarget {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return {
    name: `${platform}-${arch}`,
    bunTarget: `bun-${platform}-${arch}`,
  };
}
