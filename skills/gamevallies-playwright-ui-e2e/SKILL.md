---
name: gamevallies-playwright-ui-e2e
description: Run the live GameVallies Playwright UI full-flow regression from the frontend repo when the task is to verify the real H5 create, publish, iterate, fork, and related play/detail flows end to end. Use when the user asks for Playwright full testing, UI E2E regression, `scripts/run_live_playwright_ui_e2e.cjs`, or `tmp_playwright_ui_e2e_*.json` analysis.
---

# GameVallies Playwright UI E2E

Use the repo script `scripts/run_live_playwright_ui_e2e.cjs` for the normal path. It drives Chrome with Playwright mobile emulation against the live H5 site, creates temporary users through the admin API, and writes JSON plus screenshots into the frontend repo.

## Quick Start

1. Work from the frontend repo root:
   `d:\Project\gamevallies\gamevallies-frontend`
2. Confirm the sibling backend env file exists:
   `d:\Project\gamevallies\gamevallies-backend\.env.production`
3. Confirm `.env.production` contains at least:
   `PUBLIC_API_BASE_URL`
   `ADMIN_TOKEN`
4. Confirm Chrome exists at:
   `C:\Program Files\Google\Chrome\Application\chrome.exe`
5. Run the full suite:

```powershell
node scripts/run_live_playwright_ui_e2e.cjs
```

6. Read the emitted JSON path from stdout. The final file is usually named:
   `tmp_playwright_ui_e2e_YYYYMMDD_HHMMSS.json`

## Case Map

`--start` is 1-based and maps to:

- `1` `office_slacker_ui`
- `2` `circuit_classroom_ui`
- `3` `parkour_delivery_ui`
- `4` `fruit_merge_relax_ui`
- `5` `history_quiz_show_ui`

## Commands

### Full suite

```powershell
node scripts/run_live_playwright_ui_e2e.cjs
```

### Single-case rerun

```powershell
node scripts/run_live_playwright_ui_e2e.cjs --start 3 --limit 1
```

### Headed debug rerun

```powershell
node scripts/run_live_playwright_ui_e2e.cjs --start 3 --limit 1 --headed
```

### Partial batch rerun

```powershell
node scripts/run_live_playwright_ui_e2e.cjs --start 2 --limit 2
```

## Workflow

1. Prefer the existing Node script. Do not reconstruct the Playwright flow by hand unless the script itself is being repaired.
2. The script creates temporary author and forker users through the admin API, then runs create, publish, iterate, republish, and fork on live H5 routes.
3. While the suite is still running, inspect:
   `tmp_playwright_ui_e2e_artifacts\<stamp>\partial-results.json`
4. After the run, read the final JSON and summarize:
   - `completed`
   - `okCount`
   - per-case `caseIndex`
   - per-case `caseName`
   - per-case `ok`
   - per-case `errorStage`
   - per-case `errorMessage`
   - per-case `create.gameId`
   - per-case `iterate.gameId`
   - per-case `fork.gameId`
   - `artifactDir`
5. Use screenshots under `tmp_playwright_ui_e2e_artifacts\<stamp>\<case-name>\` for UI failures.

## Result Interpretation

- Treat the selected suite as green only when `okCount == completed` and every result has `ok: true`.
- Do not trust process success alone; the script can finish and still record one or more failing cases in the JSON.
- `sessionAnswer.answered: false` is diagnostic only. Focus first on `ok`, `errorStage`, game statuses, and screenshots.
- If a case fails in `fork_flow`, inspect the upstream iterate result first. A failed or unpublished iterate result often causes downstream timeouts.

## Failure Handling

- If the script fails before case execution, check missing Chrome, missing backend `.env.production`, invalid `ADMIN_TOKEN`, or missing `@playwright/test`.
- If only one case failed, rerun that slice with `--start N --limit 1`. Add `--headed` when debugging navigation or selector issues.
- Common evidence lives in:
  - final JSON `tmp_playwright_ui_e2e_*.json`
  - live progress file `tmp_playwright_ui_e2e_artifacts\<stamp>\partial-results.json`
  - screenshots such as `author_failure.png`, `author_after_iterate.png`, `fork_failure.png`, and `fork_success.png`
- Read `references/troubleshooting.md` when the suite fails and you need a tighter triage checklist.

## Guardrails

- This is a live verification flow. It creates temporary users, games, tasks, and screenshots.
- Do not claim the suite is fully green unless every selected case passed.
- Prefer rerunning only the failed slice before repeating all cases.
- Do not clean up created data unless the user asks.

