#!/usr/bin/env node
/**
 * Generate latest-version.json for release distribution.
 * Used by GitHub Actions release workflow.
 *
 * Usage: node scripts/generate-version-json.js [--output path] [--changelog "text"]
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { output: 'latest-version.json', changelog: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (argv[i] === '--changelog' && argv[i + 1]) {
      args.changelog = argv[++i];
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  const pkgPath = path.resolve(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const versionData = {
    version: pkg.version,
    name: pkg.name || 'planning-game-xp',
    date: new Date().toISOString(),
    changelog: args.changelog || '',
    repoUrl: 'https://github.com/manufosela/planning-game-xp',
    releaseUrl: `https://github.com/manufosela/planning-game-xp/releases/tag/v${pkg.version}`
  };

  const outputPath = path.resolve(args.output);
  fs.writeFileSync(outputPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log(`latest-version.json generated: v${pkg.version} → ${outputPath}`);
}

main();
