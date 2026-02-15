#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { normalizeDeveloperEntry } from '../public/js/utils/developer-normalizer.js';

const TARGET_FIELDS = ['developer'];

const args = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
});

function showHelp() {
  console.log(`Usage:
  node scripts/unify-developer-names.js --input exported.json [--output normalized.json] [--apply]

Options:
  --input <path>   JSON export to process (required).
  --output <path>  Destination file (default: <input>-normalized.json).
  --apply          Write changes. Without this flag the script runs in dry-run mode.
  --help           Show this message.

Example:
  node scripts/unify-developer-names.js \
    --input sample-default-rtdb-export.json \
    --output sample-default-rtdb-export-normalized.json \
    --apply
`);
}

if (args.values.help || !args.values.input) {
  showHelp();
  process.exit(args.values.input ? 0 : 1);
}

const inputPath = path.resolve(args.values.input);
const outputPath = args.values.output
  ? path.resolve(args.values.output)
  : path.resolve(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}-normalized.json`
    );
const applyChanges = Boolean(args.values.apply);

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  const trimmed = value.toString().trim();
  if (!trimmed) return '';
  const normalized = normalizeDeveloperEntry(trimmed);
  if (normalized.isUnassigned) {
    return 'Sin asignar';
  }
  return normalized.name || normalized.email || trimmed;
}

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`❌ Failed to read JSON file at ${filePath}:`, error.message);
    process.exit(1);
  }
}

const exportData = loadJson(inputPath);

const summary = {
  processed: 0,
  updated: 0,
  samples: [],
  maxSamples: 25
};

function traverse(node, currentPath = []) {
  if (!node || typeof node !== 'object') return;

  const entries = Array.isArray(node)
    ? node.map((value, index) => [String(index), value])
    : Object.entries(node);

  for (const [key, value] of entries) {
    const nextPath = currentPath.concat(key);

    if (TARGET_FIELDS.includes(key) && typeof value === 'string') {
      summary.processed += 1;
      const normalized = normalizeValue(value);
      if (normalized !== value) {
        summary.updated += 1;
        if (summary.samples.length < summary.maxSamples) {
          summary.samples.push({ path: nextPath.join('/'), from: value, to: normalized });
        }
        node[key] = normalized;
      }
    } else if (value && typeof value === 'object') {
      traverse(value, nextPath);
    }
  }
}

console.log(`ℹ️ Normalizing field(s): ${TARGET_FIELDS.join(', ')}`);
traverse(exportData);

console.log('\n===== Summary =====');
console.log(` Fields processed: ${summary.processed}`);
console.log(` Fields updated: ${summary.updated}`);
if (summary.samples.length > 0) {
  summary.samples.forEach(sample => {
    console.log(`  - ${sample.path}: "${sample.from}" -> "${sample.to}"`);
  });
  if (summary.updated > summary.samples.length) {
    console.log(`  ...and ${summary.updated - summary.samples.length} more`);
  }
}

if (!applyChanges) {
  console.log('\n✅ Dry-run complete. Re-run with --apply to write the normalized file.');
  process.exit(0);
}

try {
  fs.writeFileSync(outputPath, JSON.stringify(exportData));
  console.log(`\n✅ Normalized JSON written to ${outputPath}`);
} catch (error) {
  console.error(`❌ Failed to write output file at ${outputPath}:`, error.message);
  process.exit(1);
}
