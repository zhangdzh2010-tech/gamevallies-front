---
name: gamevallies-mobile-build
description: Package the GameVallies frontend into native mobile apps with Capacitor. Use when Codex needs to bootstrap or repair the Android/iOS wrapper, install mobile build prerequisites, sync the H5 bundle into Capacitor, produce an Android APK on Windows, or prepare and guide iOS builds on macOS with Xcode.
---

# GameVallies Mobile Build

Build the GameVallies Taro H5 output into native mobile shells with Capacitor.

Prefer the repo scripts in `package.json` for `build:app:web`, `app:sync:android`, and `app:sync:ios`. Use the bundled Windows helper to bootstrap JDK 21 and Android SDK 35 when the machine is missing mobile prerequisites.

## Quick Start

- Confirm the repo root contains `package.json`, `capacitor.config.*`, and `android/` or the ability to run `npx cap add android`.
- For Android builds on Windows, run `scripts/build-android-windows.ps1 -ProjectRoot <repo-root>`.
- For iOS builds on macOS, read `references/ios-macos.md` before running any Xcode or CocoaPods commands.

## Workflow

1. Verify the repo can emit a fresh H5 bundle with `npm run build:app:web`.
2. Verify Capacitor dependencies exist. If `@capacitor/ios` or `@capacitor/android` is missing, add it before syncing.
3. Sync the web build into the requested native platform:
   - Android: `npm run app:sync:android`
   - iOS: `npm run app:sync:ios`
4. For Windows Android packaging, use `scripts/build-android-windows.ps1`. It installs or reuses JDK 21 and Android SDK command line tools, writes `android/local.properties`, syncs Capacitor, and runs Gradle.
5. For macOS iOS packaging, follow `references/ios-macos.md`. iOS builds require macOS, Xcode, CocoaPods, and Apple signing credentials.

## Validation

- Android success looks like an APK under `android/app/build/outputs/apk/<debug|release>/`.
- `npm run build:app:web` should complete before any native sync.
- `npx cap sync <platform>` should finish without missing plugin errors.
- If Android Gradle fails, verify JDK 21 is active and `platforms;android-35` plus `build-tools;35.0.0` are installed.
- If iOS fails, confirm the build is running on macOS and that `pod install` plus signing setup are complete.

## References

- Android on Windows: read `references/android-windows.md`
- iOS on macOS: read `references/ios-macos.md`
