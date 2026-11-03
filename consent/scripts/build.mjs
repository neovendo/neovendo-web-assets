// Baut dist/: ESM, IIFE, CSS und Typen. vanilla-cookieconsent wird mit eingebunden.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const versionSource = readFileSync(join(root, 'src/version.ts'), 'utf8');
if (!versionSource.includes(`'${pkg.version}'`)) {
  throw new Error(`src/version.ts passt nicht zu package.json (${pkg.version})`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const banner = `/*! neovendo-consent ${pkg.version} | enthält vanilla-cookieconsent (MIT), siehe THIRD_PARTY_LICENSES.txt */`;
const shared = {
  bundle: true,
  minify: true,
  target: 'es2019',
  legalComments: 'inline',
  charset: 'utf8',
  banner: { js: banner, css: banner },
  absWorkingDir: root,
  logLevel: 'warning',
};

await build({ ...shared, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/neovendo-consent.mjs' });
await build({ ...shared, entryPoints: ['src/iife.ts'], format: 'iife', outfile: 'dist/neovendo-consent.iife.js' });
await build({ ...shared, entryPoints: ['src/styles.css'], outfile: 'dist/neovendo-consent.css' });

execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
writeFileSync(join(dist, 'neovendo-consent.d.mts'), "export * from './types/index.js';\n");

copyFileSync(join(root, 'node_modules/vanilla-cookieconsent/LICENSE'), join(dist, 'THIRD_PARTY_LICENSES.txt'));
const license = readFileSync(join(dist, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
writeFileSync(
  join(dist, 'THIRD_PARTY_LICENSES.txt'),
  `vanilla-cookieconsent ${pkg.dependencies['vanilla-cookieconsent']}\nhttps://github.com/orestbida/cookieconsent\n\n${license}`,
);

for (const file of ['neovendo-consent.mjs', 'neovendo-consent.iife.js', 'neovendo-consent.css']) {
  const content = readFileSync(join(dist, file));
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  console.log(`${file.padEnd(26)} ${kb(content.length).padStart(9)}  gzip ${kb(gzipSync(content).length).padStart(8)}`);
}
