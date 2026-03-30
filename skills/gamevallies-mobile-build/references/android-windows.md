# Android on Windows

Use this path when the user wants a real Android package from a Windows machine.

## Target stack

- JDK: 21
- Android SDK Platform: 35
- Build Tools: 35.0.0
- Capacitor Android: 7.x

## Preferred command

Run the bundled helper from the skill root:

```powershell
.\scripts\build-android-windows.ps1 -ProjectRoot D:\path\to\repo
```

Important flags:

- `-BuildType Release` builds `assembleRelease`
- `-SkipWebBuild` reuses the existing `dist/h5`
- `-ToolsRoot <path>` overrides the cache location for JDK and Android SDK

## What the helper does

1. Download Microsoft Build of OpenJDK 21 when no local JDK 21 is available.
2. Download Android command line tools when `sdkmanager` is missing.
3. Install `platform-tools`, `platforms;android-35`, and `build-tools;35.0.0`.
4. Write `android/local.properties`.
5. Run `npm run build:app:web`.
6. Run `npm run app:sync:android`.
7. Run `android\gradlew.bat assembleDebug` or `assembleRelease`.

## Success output

Look for:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## Common failures

- `JAVA_HOME is not set`
  Run the helper without overriding `-ToolsRoot`, or set `JAVA_HOME` to a JDK 21 install.
- `Failed to find Build Tools revision`
  Re-run the helper so `sdkmanager` can install `build-tools;35.0.0`.
- `No matching variant of project :capacitor-android`
  Run `npm install` and then `npm run app:sync:android` again.
