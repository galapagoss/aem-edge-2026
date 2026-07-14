#!/usr/bin/env node
/*
 * Block library CLI — install and vendor reusable blocks from another repository.
 *
 * Commands:
 *   list                    List blocks available in a source.
 *   add   <block...>        Ad-hoc install of one or more blocks.
 *   sync                    Vendor every block in the manifest (block-library.json
 *                           "vendored" list), pin them in block-library.lock.json, and
 *                           regenerate the aggregated JSON. Intended to run in CI.
 *   check                   Fail if any vendored block differs from the lockfile
 *                           (i.e. was hand-edited locally). Intended as a required
 *                           status check. Read-only.
 *
 * Source resolution:  --from  >  --source <name>  >  sources.default   (block-library.json)
 * A `--from` value may be a git URL or a local path.
 *
 * Installing copies a block's `blocks/<name>` folder into this project, registers it in
 * the section filter (models/_section.json), and rebuilds the aggregated component JSON.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const CONFIG_FILE = path.join(REPO_ROOT, 'block-library.json');
const LOCK_FILE = path.join(REPO_ROOT, 'block-library.lock.json');
const CACHE_ROOT = path.join(REPO_ROOT, '.block-library');
const DEST_BLOCKS = path.join(REPO_ROOT, 'blocks');
const SECTION_MODEL = path.join(REPO_ROOT, 'models', '_section.json');

const log = (msg) => process.stdout.write(`${msg}\n`);
const die = (msg) => {
  process.stderr.write(`\n✖ ${msg}\n`);
  process.exit(1);
};

/** Split argv into { command, names, flags }. */
function parseArgs(argv) {
  const flags = {};
  const names = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (key.startsWith('no-')) {
        flags[key.slice(3)] = false;
      } else if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      names.push(arg);
    }
  }
  return { command: names[0], names: names.slice(1), flags };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { sources: {}, vendored: [] };
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    return die(`Could not parse ${path.basename(CONFIG_FILE)}: ${err.message}`);
  }
}

function resolveSource(flags, config) {
  const sources = config.sources || {};
  if (flags.from) {
    const isUrl = /^(https?:|git@|ssh:|git:)/.test(flags.from);
    return {
      type: isUrl ? 'git' : 'local',
      url: isUrl ? flags.from : undefined,
      path: isUrl ? undefined : flags.from,
      ref: flags.ref || 'main',
      blocksPath: 'blocks',
    };
  }
  const name = flags.source || 'default';
  const source = sources[name];
  if (!source) die(`No source named "${name}" in block-library.json (and no --from given).`);
  return {
    blocksPath: 'blocks',
    ...source,
    ref: flags.ref || source.ref || 'main',
  };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

/**
 * Produce a local checkout of the source repo. Returns { root, blocksDir, commit }.
 * Git sources are shallow-cloned into `.block-library/` and refreshed on later runs.
 */
function materializeSource(source) {
  if (source.type === 'local') {
    const root = path.resolve(REPO_ROOT, source.path);
    if (!fs.existsSync(root)) die(`Local source path does not exist: ${root}`);
    return { root, blocksDir: path.join(root, source.blocksPath), commit: null };
  }
  if (source.type !== 'git') die(`Unsupported source type: "${source.type}".`);
  if (!source.url) {
    die('Source has no "url". Set sources.default.url in block-library.json, or pass --from <url|path>.');
  }
  const key = source.url.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const dir = path.join(CACHE_ROOT, key);
  const { ref } = source;
  try {
    const existing = fs.existsSync(path.join(dir, '.git'))
      && run('git', ['-C', dir, 'remote', 'get-url', 'origin']).trim() === source.url;
    if (!existing) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      log(`  cloning ${source.url} …`);
      run('git', ['clone', '--depth', '1', '--branch', ref, source.url, dir]);
    } else {
      log(`  updating cache for ${source.url} (${ref}) …`);
      run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', ref]);
      run('git', ['-C', dir, 'checkout', '-q', 'FETCH_HEAD']);
    }
  } catch (err) {
    die(`git failed: ${(err.stderr || err.message || '').toString().trim()}`);
  }
  const commit = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  return { root: dir, blocksDir: path.join(dir, source.blocksPath), commit };
}

function listBlocks(srcBlocksDir) {
  if (!fs.existsSync(srcBlocksDir)) die(`No blocks folder in source: ${srcBlocksDir}`);
  return fs.readdirSync(srcBlocksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(srcBlocksDir, name, `${name}.js`)))
    .sort();
}

/** Deterministic sha256 over every file in a block folder (path + bytes, sorted). */
function hashBlock(blockDir) {
  const hash = crypto.createHash('sha256');
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else {
        hash.update(relPath);
        hash.update('\0');
        hash.update(fs.readFileSync(abs));
      }
    }
  };
  walk(blockDir, '');
  return `sha256:${hash.digest('hex')}`;
}

/** Read a block's model file and return the ids of its top-level (non-item) block definitions. */
function topLevelBlockIds(blockDir, fallbackName) {
  const modelFile = fs.readdirSync(blockDir).find((f) => /^_.+\.json$/.test(f));
  if (!modelFile) return [fallbackName];
  try {
    const model = JSON.parse(fs.readFileSync(path.join(blockDir, modelFile), 'utf8'));
    const ids = (model.definitions || [])
      .filter((d) => (d?.plugins?.xwalk?.page?.resourceType || '').endsWith('/block'))
      .map((d) => d.id)
      .filter(Boolean);
    return ids.length ? ids : [fallbackName];
  } catch {
    return [fallbackName];
  }
}

function registerInSectionFilter(blockIds) {
  if (!fs.existsSync(SECTION_MODEL)) return [];
  const model = JSON.parse(fs.readFileSync(SECTION_MODEL, 'utf8'));
  const filter = (model.filters || []).find((f) => f.id === 'section');
  if (!filter) return [];
  filter.components = filter.components || [];
  const added = [];
  for (const id of blockIds) {
    if (!filter.components.includes(id)) {
      filter.components.push(id);
      added.push(id);
    }
  }
  if (added.length) fs.writeFileSync(SECTION_MODEL, `${JSON.stringify(model, null, 2)}\n`);
  return added;
}

function installBlock(name, srcBlocksDir, { force }) {
  const src = path.join(srcBlocksDir, name);
  if (!fs.existsSync(path.join(src, `${name}.js`))) {
    die(`Block "${name}" not found in source (expected ${name}/${name}.js).`);
  }
  const dest = path.join(DEST_BLOCKS, name);
  if (fs.existsSync(dest) && force !== true) {
    die(`Block "${name}" already exists at blocks/${name}. Re-run with --force to overwrite.`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  return { ids: topLevelBlockIds(dest, name), dest };
}

const GA_START = '# >>> block-library (generated — do not edit) >>>';
const GA_END = '# <<< block-library <<<';

/** Maintain a managed section in .gitattributes marking vendored blocks as generated. */
function updateGitattributes(vendored) {
  const file = path.join(REPO_ROOT, '.gitattributes');
  const lines = [
    GA_START,
    'block-library.lock.json linguist-generated=true',
    ...vendored.map((name) => `blocks/${name}/** linguist-generated=true`),
    GA_END,
  ];
  const block = lines.join('\n');
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`${GA_START}[\\s\\S]*?${GA_END}\\n?`);
  if (re.test(content)) content = content.replace(re, `${block}\n`);
  else content = `${content}${content && !content.endsWith('\n') ? '\n' : ''}${block}\n`;
  fs.writeFileSync(file, content);
}

function buildJson() {
  log('  running build:json …');
  run('npm', ['run', 'build:json'], { cwd: REPO_ROOT, stdio: 'inherit' });
}

function cmdList(source) {
  const { blocksDir } = materializeSource(source);
  const blocks = listBlocks(blocksDir);
  log(`\nBlocks available in ${source.url || source.path}:\n`);
  blocks.forEach((b) => log(`  • ${b}`));
  log(`\n${blocks.length} block(s). Install with:  npm run blocks:add -- <name>\n`);
}

function cmdAdd(names, flags, source) {
  if (!names.length) die('Specify at least one block name: npm run blocks:add -- <name>');
  const { blocksDir } = materializeSource(source);
  log(`\nInstalling from ${source.url || source.path} (${source.ref || 'local'}):`);
  const ids = [];
  for (const name of names) {
    const { ids: blockIds } = installBlock(name, blocksDir, flags);
    ids.push(...blockIds);
    log(`  ✓ copied blocks/${name}`);
  }
  if (flags.filter !== false) {
    const added = registerInSectionFilter(ids);
    if (added.length) log(`  ✓ registered in section filter: ${added.join(', ')}`);
  }
  if (flags.build !== false) buildJson();
  log('\n✔ Done. Run `npm run lint` and preview the block on a page.\n');
}

/** Vendor every block listed in the manifest, pin the lockfile, rebuild JSON. */
function cmdSync(flags, config, source) {
  const vendored = config.vendored || [];
  if (!vendored.length) {
    log('\nNothing to sync: block-library.json "vendored" list is empty.\n');
    return;
  }
  const { blocksDir, commit } = materializeSource(source);
  log(`\nVendoring ${vendored.length} block(s) from ${source.url || source.path} (${source.ref}):`);
  const ids = [];
  const lockBlocks = {};
  for (const name of vendored) {
    const { ids: blockIds, dest } = installBlock(name, blocksDir, { force: true });
    ids.push(...blockIds);
    lockBlocks[name] = { hash: hashBlock(dest), ids: blockIds };
    log(`  ✓ ${name}`);
  }
  if (flags.filter !== false) registerInSectionFilter(ids);
  const lock = {
    source: source.url || path.resolve(REPO_ROOT, source.path),
    ref: source.ref || null,
    commit: commit || null,
    generatedBy: 'tools/blocks/cli.mjs sync',
    blocks: lockBlocks,
  };
  fs.writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  log(`  ✓ wrote ${path.basename(LOCK_FILE)} (commit ${commit ? commit.slice(0, 8) : 'local'})`);
  updateGitattributes(vendored);
  log('  ✓ marked vendored blocks generated in .gitattributes');
  if (flags.build !== false) buildJson();
  log('\n✔ Sync complete.\n');
}

/** Fail if a vendored block is missing or differs from the lockfile (i.e. hand-edited). */
function cmdCheck() {
  if (!fs.existsSync(LOCK_FILE)) {
    die(`No ${path.basename(LOCK_FILE)}. Run \`npm run blocks:sync\` first.`);
  }
  const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  const problems = [];
  for (const [name, entry] of Object.entries(lock.blocks || {})) {
    const dest = path.join(DEST_BLOCKS, name);
    if (!fs.existsSync(dest)) {
      problems.push(`  ✖ blocks/${name} is missing (expected from library).`);
    } else if (hashBlock(dest) !== entry.hash) {
      problems.push(`  ✖ blocks/${name} has been modified locally (does not match the lockfile).`);
    }
  }
  if (problems.length) {
    process.stderr.write('\nVendored blocks are read-only and maintained in the library repo.\n');
    process.stderr.write(`${problems.join('\n')}\n`);
    process.stderr.write('\nRevert your changes, or make them in the library repo and run `npm run blocks:sync`.\n\n');
    process.exit(1);
  }
  log(`\n✔ All ${Object.keys(lock.blocks || {}).length} vendored block(s) match the lockfile.\n`);
}

function main() {
  const { command, names, flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  if (command === 'check') return cmdCheck();

  const source = resolveSource(flags, config);
  if (command === 'list') return cmdList(source);
  if (command === 'add') return cmdAdd(names, flags, source);
  if (command === 'sync') return cmdSync(flags, config, source);

  return die('Usage: cli.mjs <list|add|sync|check> [block...] [--from <url|path>] [--ref <ref>] [--source <name>] [--force] [--no-filter] [--no-build]');
}

main();
