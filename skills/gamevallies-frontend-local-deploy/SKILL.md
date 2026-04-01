---
name: gamevallies-frontend-local-deploy
description: Build and locally deploy the GameVallies frontend H5 bundle to the Volcengine `gv-frontend` function from a Windows PowerShell environment. Use when asked to publish, release, redeploy, or verify the GameVallies frontend without GitHub Actions, especially when `.env.deploy` credentials are quoted or `scripts/deploy.py` fails with Windows encoding or VCR login issues.
---

# GameVallies Frontend Local Deploy

Use the bundled PowerShell script for the normal path. It builds H5, loads `.env.deploy` as UTF-8, strips one pair of wrapping quotes from credentials, forces UTF-8 Python I/O, runs `scripts/deploy.py`, and can verify production afterwards.

## Quick Start

1. Run `scripts/deploy_frontend_local.ps1 -RepoPath <repo-path>`.
2. Add `-SkipBuild` only when `dist/h5` is already fresh.
3. Add `-VerifyPatterns 'pattern-a','pattern-b'` when you need to confirm a specific change reached production.
4. Add `-DryRun` to validate env parsing and command selection without deploying.

## Workflow

1. Confirm the repo contains `.env.deploy`, `package.json`, and `scripts/deploy.py`.
2. Prefer `npm.cmd run build:h5` unless the user explicitly wants to skip it.
3. Load `.env.deploy` with UTF-8 and remove one pair of wrapping quotes from values like `VOLCENGINE_REGISTRY_USERNAME="..."`.
4. Set `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` before running Python.
5. Run the bundled deploy script instead of reconstructing the command by hand.
6. After deploy, verify `https://gamevallies.com/api/v1/health`.
7. If feature verification matters, inspect local `dist/h5/js/app.js` and `dist/h5/chunk/*.js` for target patterns, then check the same remote paths on `https://gamevallies.com/`. Do not assume `js/app.js` alone contains the new code.

## Failure Handling

- If `docker login` says the username is invalid, re-check that `.env.deploy` was read as UTF-8 and that wrapping quotes were removed.
- If `deploy.py` throws `UnicodeEncodeError`, UTF-8 Python env vars were not applied.
- If deploy reports success but production still looks old, wait briefly and inspect remote chunk files, not only `js/app.js`.

## Resources

- Use `scripts/deploy_frontend_local.ps1` for the standard deployment path.
- Read `references/troubleshooting.md` when deployment or verification behaves unexpectedly.
