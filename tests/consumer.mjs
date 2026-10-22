import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp = mkdtempSync(join(tmpdir(), 'huahua-consumer-'));
try {
  const packDir = join(temp, 'pack'); mkdirSync(packDir);
  execFileSync('pnpm', ['--dir', 'packages/huahua', 'pack', '--pack-destination', packDir], { stdio: 'inherit' });
  const tarball = join(packDir, 'huahua-core-0.1.0.tgz');
  const consumer = join(temp, 'consumer'); mkdirSync(consumer);
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', consumer, tarball], { stdio: 'inherit', env: { ...process.env, npm_config_cache: join(temp, 'npm-cache') } });
  writeFileSync(join(consumer, 'check.mjs'), "import { createAnnotator, MemoryStorage } from '@huahua/core'; if (typeof createAnnotator !== 'function' || typeof MemoryStorage !== 'function') throw new Error('package exports missing');\n");
  execFileSync(process.execPath, ['check.mjs'], { cwd: consumer, stdio: 'inherit' });
  writeFileSync(join(consumer, 'check.ts'), "import { createAnnotator } from '@huahua/core'; declare const root: HTMLElement; void createAnnotator({ root, document: { id: 'doc', renditionId: 'reader' } });\n");
  execFileSync('pnpm', ['exec', 'tsc', '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'ES2022,DOM', join(consumer, 'check.ts')], { cwd: process.cwd(), stdio: 'inherit' });
  console.log('Packed ESM import and declaration consumer checks passed.');
} finally { rmSync(temp, { recursive: true, force: true }); }
