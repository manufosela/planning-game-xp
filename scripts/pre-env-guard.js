#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseEnvContent, evaluatePreEnvSafety } from './pre-env-guard-lib.js';

const root = process.cwd();
const prePath = path.join(root, '.env.pre');
const prodPath = path.join(root, '.env.prod');

if (process.env.ALLOW_PRE_USING_PROD === 'true') {
  console.log('⚠️  ALLOW_PRE_USING_PROD=true set. Skipping pre-env guard.');
  process.exit(0);
}

if (!fs.existsSync(prePath)) {
  console.error('❌ .env.pre not found. Aborting npm run pre.');
  process.exit(1);
}

if (!fs.existsSync(prodPath)) {
  console.error('❌ .env.prod not found. Aborting npm run pre.');
  process.exit(1);
}

const preEnv = parseEnvContent(fs.readFileSync(prePath, 'utf8'));
const prodEnv = parseEnvContent(fs.readFileSync(prodPath, 'utf8'));

const verdict = evaluatePreEnvSafety(preEnv, prodEnv);

if (!verdict.ok) {
  console.error('❌ Safety check failed for npm run pre:');
  verdict.reasons.forEach((reason) => console.error(`  - ${reason}`));
  console.error('Set ALLOW_PRE_USING_PROD=true only if you explicitly accept the risk.');
  process.exit(1);
}

console.log('✅ pre-env guard passed (.env.pre is isolated from .env.prod).');
process.exit(0);

