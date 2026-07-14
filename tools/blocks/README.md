# Block library

Vendor reusable blocks from a **separate library repository** into this project. Library
blocks are treated as **generated, CI-owned artifacts**: developers don't hand-edit them
here — they're authored in the library repo and pulled in by a GitHub Action.

## Why blocks still live in this repo

Edge Delivery serves the site directly from the files on the git branch — there is no build
step or runtime package fetch. So a block's `.js`/`.css` **must physically exist on the
branch**. We can't make library blocks "never touch the repo"; instead we vendor them as
read-only, generated files and enforce that with a CI drift check.

## Two ways to use it

### Ad-hoc install (developer picks a block)

```bash
npm run blocks:list                 # see what the library offers
npm run blocks:add -- cards hero    # copy blocks in (note the `--`)
```

Good for one-off reuse. These are normal files you own.

### Vendored (read-only, library-owned) — the governed model

1. List the blocks you want in `block-library.json` under `"vendored"`:
   ```json
   { "sources": { "default": { "type": "git", "url": "https://github.com/your-org/block-library.git", "ref": "main", "blocksPath": "blocks" } },
     "vendored": ["callout", "promo"] }
   ```
2. The **Sync block library** GitHub Action (`.github/workflows/block-library-sync.yml`)
   runs on a schedule / on demand, executes `npm run blocks:sync`, and opens a PR with the
   updated blocks + `block-library.lock.json`.
3. The **Block library check** Action (`.github/workflows/block-library-check.yml`) runs
   `npm run blocks:check` on every PR and **fails if a vendored block was hand-edited**.

To change a vendored block, edit it in the **library repo** and let the sync bring it over.

## Commands

| Command | What it does |
|---------|--------------|
| `npm run blocks:list` | List blocks available in the source. |
| `npm run blocks:add -- <name...>` | Ad-hoc copy of blocks into `blocks/`. |
| `npm run blocks:sync` | Vendor every block in the manifest, write the lockfile + `.gitattributes`, rebuild JSON. (CI) |
| `npm run blocks:check` | Fail if any vendored block differs from the lockfile. (CI gate) |

### Flags (`add` / `sync` / `list`)

| Flag | Effect |
|------|--------|
| `--from <url\|path>` | Override the source: git URL or local folder. |
| `--ref <ref>` | Git branch/tag to pull. |
| `--source <name>` | Use a named source from `block-library.json`. |
| `--force` | (add) Overwrite an existing block. |
| `--no-filter` | Don't register the block in the section filter. |
| `--no-build` | Skip `npm run build:json`. |

## Making vendored blocks truly read-only

The drift check only *enforces* read-only once it's required by branch protection:

1. Push these files; both workflows appear under **Actions**.
2. **Settings → Branches → branch protection for `main`** → *Require status checks to pass* →
   select **verify** (from *Block library check*).
3. Fill in `.github/CODEOWNERS` (replace the placeholder team, uncomment the lines) so edits
   to `tools/blocks`, the manifest/lockfile, and vendored block folders route to maintainers.
4. For a **private** library repo, add a `BLOCK_LIBRARY_TOKEN` secret (read access) — the
   sync workflow uses it to clone. `blocks:check` needs no access.
5. Enable **Settings → Actions → General → Allow GitHub Actions to create pull requests**.

## Files

| Path | Role |
|------|------|
| `block-library.json` | Sources + the `vendored` manifest (you edit this). |
| `block-library.lock.json` | Pinned commit + content hashes (generated; commit it). |
| `.gitattributes` (managed block) | Marks vendored blocks `linguist-generated` (generated). |
| `tools/blocks/cli.mjs` | The CLI. |
| `.github/workflows/block-library-*.yml` | Sync + check Actions. |
| `.block-library/` | Local clone cache (git-ignored). |
