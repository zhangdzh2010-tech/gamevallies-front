# Troubleshooting

## Known Windows issues

- Read `.env.deploy` with UTF-8. If the VCR username becomes mojibake, `docker login` can fail even when the password is correct.
- Strip one pair of wrapping quotes from `.env.deploy` values like `VOLCENGINE_REGISTRY_USERNAME="..."` and `VOLCENGINE_REGISTRY_PASSWORD="..."` before setting process env vars.
- Set `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` before running `python scripts/deploy.py`, otherwise Windows can throw `UnicodeEncodeError` when the deploy script prints emoji or Chinese text.
- Use `C:\Windows\System32\curl.exe` directly if `curl.exe` is not on PATH.

## Verification

1. Check `https://gamevallies.com/api/v1/health`.
2. If you need to confirm a feature rollout, scan local `dist/h5/js/app.js` and `dist/h5/chunk/*.js` for target strings.
3. Check the same remote files on `https://gamevallies.com/`.
4. Do not rely on `js/app.js` alone; page code can live in numbered chunk files.
5. Wait 60-120 seconds after release before assuming the old bundle is stuck.

## Example invocation

```powershell
C:\Users\zhang\.codex\skills\gamevallies-frontend-local-deploy\scripts\deploy_frontend_local.ps1 `
  -RepoPath d:\Project\gamevallies\gamevallies-frontend `
  -VerifyPatterns 'play-landscape/index','PageScrollContainer','orientation.lock'
```

