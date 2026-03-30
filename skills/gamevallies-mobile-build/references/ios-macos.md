# iOS on macOS

Use this path only on macOS. iOS packaging cannot be completed on Windows because Xcode and Apple signing tools are required.

## Required prerequisites

- macOS with Xcode installed
- Xcode Command Line Tools
- CocoaPods
- Apple Developer signing certificates and provisioning profiles
- Node.js and npm

## Repo preparation

From the repo root:

```bash
npm install
npm run build:app:web
npm run app:sync:ios
```

If the repo does not yet have an `ios/` folder, add it on macOS:

```bash
npx cap add ios
```

## CocoaPods step

Install native pods after every plugin or Capacitor update:

```bash
cd ios/App
pod install
```

## Open in Xcode

```bash
npm run app:ios
```

Preferred from there:

1. Select the correct signing team.
2. Build once in Xcode to surface provisioning issues.
3. Archive through Product > Archive for App Store or TestFlight delivery.

## Headless build option

For CI or scripted archives:

```bash
cd ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath build/App.xcarchive \
  archive
```

Then export with an `ExportOptions.plist` that matches the release channel.

## Common failures

- `xcodebuild: error: SDK "iphoneos" cannot be located`
  Xcode or the Command Line Tools are not configured.
- `pod: command not found`
  Install CocoaPods with `sudo gem install cocoapods` or the team's preferred package manager.
- Signing or provisioning errors
  Fix them in Xcode first, then repeat the archive.
