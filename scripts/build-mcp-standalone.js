#!/usr/bin/env node

/**
 * Build MCP Standalone Package
 *
 * Generates a self-contained dist-mcp/ directory that can be distributed
 * independently of the main Planning Game web app.
 *
 * What it does:
 * 1. Copies mcp/ source files to dist-mcp/
 * 2. Copies shared/ to dist-mcp/lib/shared/
 * 3. Rewrites ../../shared/ imports to ./lib/shared/ (or ../lib/shared/)
 * 4. Generates a standalone package.json
 * 5. Copies Dockerfile adapted for standalone use
 */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const MCP_SRC = join(ROOT, 'mcp');
const SHARED_SRC = join(ROOT, 'shared');
const DIST = join(ROOT, 'dist-mcp');

function clean() {
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });
}

function copyMcpSource() {
  // Copy JS files (root level)
  for (const file of readdirSync(MCP_SRC)) {
    const src = join(MCP_SRC, file);
    const stat = statSync(src);

    // Skip node_modules, tests, and non-essential files
    if (['node_modules', 'tests', 'docker-compose.yml'].includes(file)) continue;

    if (stat.isFile()) {
      cpSync(src, join(DIST, file));
    }
  }

  // Copy subdirectories (tools/, services/, utils/, commands/)
  for (const dir of ['tools', 'services', 'utils', 'commands']) {
    const srcDir = join(MCP_SRC, dir);
    if (existsSync(srcDir)) {
      cpSync(srcDir, join(DIST, dir), { recursive: true });
    }
  }
}

function copyShared() {
  const sharedDist = join(DIST, 'lib', 'shared');
  mkdirSync(sharedDist, { recursive: true });

  for (const file of readdirSync(SHARED_SRC)) {
    if (file.endsWith('.js')) {
      cpSync(join(SHARED_SRC, file), join(sharedDist, file));
    }
  }

  // Ensure shared/ is treated as ESM
  writeFileSync(join(sharedDist, 'package.json'), '{"type":"module"}\n');
}

function rewriteImports(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      rewriteImports(fullPath);
      continue;
    }

    if (!entry.endsWith('.js')) continue;

    let content = readFileSync(fullPath, 'utf-8');
    const relDir = relative(DIST, dirname(fullPath));

    // Calculate the correct relative path from this file to lib/shared/
    const depth = relDir ? relDir.split('/').length : 0;
    const prefix = depth > 0 ? '../'.repeat(depth) : './';
    const sharedPath = `${prefix}lib/shared`;

    // Replace any ../... path that lands on shared/ (regardless of depth)
    // with the correct relative path to lib/shared/.
    // Matches: `from '../shared/...'`, `from '../../shared/...'`, etc.
    const modified = content.replace(
      /from\s+['"](?:\.\.\/)+shared\//g,
      `from '${sharedPath}/`
    );

    if (modified !== content) {
      writeFileSync(fullPath, modified);
    }
  }
}

function validateNoResidualSharedImports() {
  const offenders = [];

  function scan(dir) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      // Skip the lib/shared tree itself — those imports are intentional (bare relatives inside shared/)
      if (stat.isDirectory()) {
        if (fullPath === join(DIST, 'lib')) continue;
        scan(fullPath);
        continue;
      }

      if (!entry.endsWith('.js')) continue;

      const content = readFileSync(fullPath, 'utf-8');
      const residual = content.match(/from\s+['"](?:\.\.\/)+shared\/[^'"]+['"]/g);
      if (residual) {
        offenders.push({ file: relative(DIST, fullPath), imports: residual });
      }
    }
  }

  scan(DIST);

  if (offenders.length > 0) {
    console.error('\nBUILD FAILED: residual imports to raw shared/ found:');
    for (const o of offenders) {
      console.error(`  ${o.file}:`);
      for (const imp of o.imports) console.error(`    ${imp}`);
    }
    console.error('\nExpected all shared/ imports to be rewritten to lib/shared/.');
    console.error('Check the rewriteImports() regex in build-mcp-standalone.js.');
    process.exit(1);
  }
}

function runSmokeTest() {
  // Install deps in isolation, then run `node index.js --version` to catch any
  // module resolution error before we ship the tarball.
  console.log('    running npm install in dist-mcp/...');
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: DIST,
    stdio: 'inherit'
  });
  if (install.status !== 0) {
    console.error('\nBUILD FAILED: npm install in dist-mcp/ failed.');
    process.exit(1);
  }

  console.log('    running `node index.js --version`...');
  const smoke = spawnSync('node', ['index.js', '--version'], {
    cwd: DIST,
    encoding: 'utf-8'
  });
  if (smoke.status !== 0) {
    console.error('\nBUILD FAILED: smoke test could not start the MCP server.');
    console.error('  stdout:', smoke.stdout);
    console.error('  stderr:', smoke.stderr);
    console.error('\nThis usually means a module import is broken — most likely');
    console.error('a path to shared/ was not rewritten, or a file is missing from dist-mcp/.');
    process.exit(1);
  }
  console.log(`    smoke OK (${smoke.stdout.trim()})`);
}

function fixVersionCheck() {
  // version-check.js uses ROOT_DIR = join(__dirname, '..') to find mcp/package.json
  // In standalone mode, package.json is in the same directory
  const vcPath = join(DIST, 'version-check.js');
  if (!existsSync(vcPath)) return;

  let content = readFileSync(vcPath, 'utf-8');
  content = content.replace(
    "const ROOT_DIR = join(__dirname, '..');",
    "const ROOT_DIR = __dirname;"
  );
  content = content.replace(
    "const packagePath = join(ROOT_DIR, 'mcp', 'package.json');",
    "const packagePath = join(ROOT_DIR, 'package.json');"
  );
  writeFileSync(vcPath, content);
}

function addShebang() {
  const indexPath = join(DIST, 'index.js');
  if (!existsSync(indexPath)) return;

  let content = readFileSync(indexPath, 'utf-8');
  if (!content.startsWith('#!')) {
    content = '#!/usr/bin/env node\n' + content;
    writeFileSync(indexPath, content);
  }
}

function generatePackageJson() {
  const original = JSON.parse(readFileSync(join(MCP_SRC, 'package.json'), 'utf-8'));

  const standalone = {
    name: 'planning-game-mcp',
    version: original.version,
    description: 'Planning Game MCP Server - Standalone distribution. Agile project management (XP) via Model Context Protocol.',
    type: 'module',
    main: 'index.js',
    bin: {
      'planning-game-mcp': './index.js'
    },
    scripts: {
      start: 'node index.js'
    },
    keywords: [
      'mcp', 'model-context-protocol', 'planning', 'agile', 'xp',
      'extreme-programming', 'project-management', 'firebase',
      'claude', 'ai', 'sprint', 'kanban', 'scrum'
    ],
    author: original.author || 'Geniova',
    license: original.license || 'MIT',
    repository: {
      type: 'git',
      url: 'https://github.com/manufosela/planning-game-xp',
      directory: 'mcp'
    },
    homepage: 'https://github.com/manufosela/planning-game-xp/tree/main/mcp#readme',
    dependencies: original.dependencies,
    engines: {
      node: '>=20.0.0'
    }
  };

  writeFileSync(join(DIST, 'package.json'), JSON.stringify(standalone, null, 2) + '\n');
}

function generateNpmIgnore() {
  const npmignore = `Dockerfile
docker-compose.yml
*.test.js
tests/
.env*
serviceAccountKey.json
mcp.user.json
.mcp-user.json
`;
  writeFileSync(join(DIST, '.npmignore'), npmignore);
}

function generateDockerfile() {
  const dockerfile = `FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# serviceAccountKey.json and mcp.user.json are mounted as volumes, NOT baked in

ENTRYPOINT ["node", "index.js"]
`;
  writeFileSync(join(DIST, 'Dockerfile'), dockerfile);
}

function copyReadme() {
  const readmeSrc = join(MCP_SRC, 'README.md');
  if (existsSync(readmeSrc)) {
    cpSync(readmeSrc, join(DIST, 'README.md'));
  }
}

// Main
console.log('Building MCP standalone package...');
console.log(`  Source: ${MCP_SRC}`);
console.log(`  Shared: ${SHARED_SRC}`);
console.log(`  Output: ${DIST}`);
console.log();

clean();
console.log('  [1/11] Copying MCP source...');
copyMcpSource();

console.log('  [2/11] Copying shared/ to lib/shared/...');
copyShared();

console.log('  [3/11] Rewriting imports...');
rewriteImports(DIST);

console.log('  [4/11] Fixing version-check paths...');
fixVersionCheck();

console.log('  [5/11] Adding shebang to index.js...');
addShebang();

console.log('  [6/11] Generating standalone package.json...');
generatePackageJson();

console.log('  [7/11] Generating .npmignore...');
generateNpmIgnore();

console.log('  [8/11] Generating Dockerfile...');
generateDockerfile();

console.log('  [9/11] Copying README...');
copyReadme();

console.log('  [10/11] Validating no residual shared/ imports...');
validateNoResidualSharedImports();

console.log('  [11/11] Running smoke test...');
runSmokeTest();

// Summary
const fileCount = readdirSync(DIST, { recursive: true }).length;
const pkg = JSON.parse(readFileSync(join(DIST, 'package.json'), 'utf-8'));
console.log();
console.log(`Done! ${fileCount} files written to dist-mcp/`);
console.log(`  Package: ${pkg.name}@${pkg.version}`);
console.log();
console.log('To publish (from repo root):');
console.log('  npm run mcp:publish');
console.log();
console.log('To install globally:');
console.log('  npm install -g planning-game-mcp');
