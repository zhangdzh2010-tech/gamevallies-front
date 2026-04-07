# Troubleshooting

## Immediate setup failures

- Missing backend env file:
  The script reads `d:\Project\gamevallies\gamevallies-backend\.env.deploy` through a fixed sibling-repo path.
- Missing Chrome executable:
  The script launches `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Missing Playwright package:
  The script imports `@playwright/test`.
- Admin API failures:
  Check `ADMIN_TOKEN` first because the script creates temporary users before opening the UI flow.

## Mid-run failures

- `errorStage = "author_flow"`:
  Inspect `author_failure.png` and the `create` plus `iterate` sections in the JSON.
- `errorStage = "fork_flow"` with a timeout waiting for `.action-buttons .play-btn`:
  Inspect `iterate.statusAfterPublish`, `iterate.detailUrl`, and `fork_failure.png` first. The iterate game may have failed or never reached a playable published state.
- `sessionAnswer.answered = false`:
  This is not always the root cause. Treat it as supporting evidence unless the page clearly required an answer to continue.

## Reporting checklist

Include these fields in the first summary:

- `caseIndex`
- `caseName`
- `ok`
- `errorStage`
- `errorMessage`
- `create.gameId`
- `iterate.gameId`
- `fork.gameId`
- `artifactDir`
