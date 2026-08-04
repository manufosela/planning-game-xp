#!/usr/bin/env node
/**
 * Bulk import of a local /docs/*.md folder into a PG instance's wiki.
 *
 * Usage:
 *   node scripts/import-docs.js <localDocsPath> <instanceName> <sectionName> [--dry-run]
 *
 * Example:
 *   node scripts/import-docs.js ~/ws_tribbu/simulador-estrategia-tribbu/docs tribbu "Simulador Estratégico"
 *
 * Model (matches /docs and /doc-sections in RTDB):
 *   - Creates (idempotent) a section in /doc-sections/{slug}
 *     { name, slug, order }
 *   - For each .md file, creates a doc in /docs/{pushKey}
 *     { title, content, path, section, order, createdAt, createdBy }
 *   - Skips .md files whose (section, path) tuple already exists (idempotent).
 *   - Ignores non-.md files silently (.docx, images, etc.).
 *   - Title from first `# heading` line; fallback to a humanized filename.
 *   - `order` from numeric prefix `NN-` in the filename; fallback to alphabetic.
 *     README.md always gets order 0.
 *   - `path` = subdir-prefixed slug of the filename WITHOUT the numeric prefix.
 *     E.g. `01-arquitectura.md` -> `arquitectura`, `backlog/dinero.md` -> `backlog/dinero`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/import-docs.js <localDocsPath> <instanceName> <sectionName> [--dry-run]');
  process.exit(1);
}
const [rawLocalPath, instanceName, sectionName, ...flags] = args;
const dryRun = flags.includes('--dry-run');

const localPath = rawLocalPath.startsWith('~')
  ? path.join(os.homedir(), rawLocalPath.slice(1))
  : path.resolve(rawLocalPath);

if (!fs.existsSync(localPath)) {
  console.error(`Local path does not exist: ${localPath}`);
  process.exit(1);
}

const instanceDir = path.join(__dirname, '..', 'planning-game-instances', instanceName);
const saPath = path.join(instanceDir, 'serviceAccountKey.json');
if (!fs.existsSync(saPath)) {
  console.error(`Instance "${instanceName}" has no serviceAccountKey.json at ${saPath}`);
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(instanceDir, '.firebaserc'), 'utf8'));
const projectId = rc.projects.default;
const databaseURL = `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL });

function slugify(str) {
  return str
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function humanize(str) {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b(\w)/g, (m) => m.toUpperCase())
    .trim();
}

function findMarkdownFiles(root) {
  const results = [];
  function walk(dir, relDir = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push({ absPath: abs, relPath: rel });
      }
    }
  }
  walk(root);
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function extractTitle(content, fallback) {
  const match = content.match(/^\s*#\s+(.+?)\s*$/m);
  if (match) return match[1].trim();
  return fallback;
}

function computeOrder(basename) {
  if (/^readme\.md$/i.test(basename)) return 0;
  const m = basename.match(/^(\d+)[-_]/);
  return m ? parseInt(m[1], 10) : 9999;
}

function computePath(relPath) {
  const parts = relPath.split('/');
  const filename = parts.pop().replace(/\.md$/i, '');
  const cleaned = filename.replace(/^\d+[-_]/, '');
  const slug = slugify(cleaned);
  return parts.length > 0 ? `${parts.map(slugify).join('/')}/${slug}` : slug;
}

async function main() {
  const db = admin.database();
  const sectionSlug = slugify(sectionName);
  const files = findMarkdownFiles(localPath);

  console.log(`Instance: ${instanceName} (${projectId})`);
  console.log(`Local path: ${localPath}`);
  console.log(`Section: "${sectionName}" (slug: ${sectionSlug})`);
  console.log(`Markdown files found: ${files.length}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log('');

  // 1) Upsert section
  const sectionsSnap = await db.ref('/doc-sections').once('value');
  const sections = sectionsSnap.val() || {};
  const existingSection = Object.entries(sections).find(([, s]) => s && s.slug === sectionSlug);
  if (existingSection) {
    console.log(`Section already exists: ${existingSection[0]}`);
  } else if (!dryRun) {
    const nextOrder = Object.values(sections).reduce((m, s) => Math.max(m, s.order || 0), 0) + 1;
    const newSectionRef = db.ref('/doc-sections').push();
    await newSectionRef.set({ name: sectionName, slug: sectionSlug, order: nextOrder });
    console.log(`Section created: ${newSectionRef.key}`);
  } else {
    console.log(`Section would be created (slug=${sectionSlug})`);
  }

  // 2) Load existing docs to dedupe by (section, path)
  const docsSnap = await db.ref('/docs').once('value');
  const existingDocs = docsSnap.val() || {};
  const existingKeys = new Set(
    Object.values(existingDocs)
      .filter(d => d && d.section === sectionSlug && d.path)
      .map(d => d.path)
  );

  let imported = 0;
  let skipped = 0;
  for (const file of files) {
    const content = fs.readFileSync(file.absPath, 'utf8');
    const basename = path.basename(file.relPath);
    const docPath = computePath(file.relPath);

    if (existingKeys.has(docPath)) {
      console.log(`  SKIP  ${file.relPath} (already at ${sectionSlug}/${docPath})`);
      skipped++;
      continue;
    }

    const title = extractTitle(content, humanize(basename.replace(/^\d+[-_]/, '').replace(/\.md$/i, '')));
    const order = computeOrder(basename);
    const docData = {
      title,
      content,
      path: docPath,
      section: sectionSlug,
      order,
      createdAt: new Date().toISOString(),
      createdBy: 'scripts/import-docs.js'
    };

    if (dryRun) {
      console.log(`  PLAN  ${file.relPath}  ->  ${sectionSlug}/${docPath}  order=${order}  title="${title}"`);
    } else {
      const newDocRef = db.ref('/docs').push();
      await newDocRef.set(docData);
      console.log(`  OK    ${file.relPath}  ->  ${sectionSlug}/${docPath}  (id ${newDocRef.key})`);
    }
    imported++;
  }

  console.log('');
  console.log(`Summary: ${imported} to import, ${skipped} skipped (already present).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
