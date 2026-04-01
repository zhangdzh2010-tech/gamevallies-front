param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$ToolsRoot = "$env:USERPROFILE\\.codex\\tools\\mobile-build",
  [ValidateSet("Debug", "Release")]
  [string]$BuildType = "Debug",
  [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Download-File {
  param(
    [string]$Url,
    [string]$Destination
  )

  if (Test-Path -LiteralPath $Destination) {
    return
  }

  Ensure-Directory -Path (Split-Path -Parent $Destination)
  & "C:\Windows\System32\curl.exe" -L --retry 5 --retry-delay 2 --fail --output $Destination $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed for $Url"
  }
}

function Find-JavaHome {
  param([string]$SearchRoot)

  $javaExe = Get-ChildItem -Path $SearchRoot -File -Filter java.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $javaExe) {
    return $null
  }

  $binDir = Split-Path -Path $javaExe.FullName -Parent
  return Split-Path -Path $binDir -Parent
}

function Ensure-JavaHome {
  param([string]$BaseDir)

  $jdkRoot = Join-Path $BaseDir "jdk-21"
  $downloadsDir = Join-Path $BaseDir "downloads"
  $zipPath = Join-Path $downloadsDir "microsoft-jdk-21-windows-x64.zip"
  $extractDir = Join-Path $jdkRoot "extract"

  Ensure-Directory -Path $jdkRoot
  Ensure-Directory -Path $downloadsDir

  $javaHome = Find-JavaHome -SearchRoot $jdkRoot
  if ($javaHome) {
    return $javaHome
  }

  Write-Step "Downloading Microsoft OpenJDK 21"
  Download-File -Url "https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip" -Destination $zipPath

  if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }

  Ensure-Directory -Path $extractDir
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $javaHome = Find-JavaHome -SearchRoot $extractDir
  if (-not $javaHome) {
    throw "Unable to locate java.exe after extracting the JDK."
  }

  return $javaHome
}

function Ensure-AndroidSdk {
  param([string]$BaseDir)

  if ($env:ANDROID_SDK_ROOT -and (Test-Path -LiteralPath (Join-Path $env:ANDROID_SDK_ROOT "cmdline-tools\\latest\\bin\\sdkmanager.bat"))) {
    return $env:ANDROID_SDK_ROOT
  }

  $sdkRoot = Join-Path $BaseDir "android-sdk"
  $downloadsDir = Join-Path $BaseDir "downloads"
  $zipPath = Join-Path $downloadsDir "commandlinetools-win.zip"
  $extractDir = Join-Path $sdkRoot "cmdline-tools-extract"
  $latestDir = Join-Path $sdkRoot "cmdline-tools\\latest"
  $sdkManager = Join-Path $latestDir "bin\\sdkmanager.bat"

  Ensure-Directory -Path $sdkRoot
  Ensure-Directory -Path $downloadsDir

  if (-not (Test-Path -LiteralPath $sdkManager)) {
    Write-Step "Downloading Android command line tools"
    Download-File -Url "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" -Destination $zipPath

    if (Test-Path -LiteralPath $extractDir) {
      Remove-Item -LiteralPath $extractDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $latestDir) {
      Remove-Item -LiteralPath $latestDir -Recurse -Force
    }

    Ensure-Directory -Path $extractDir
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

    $toolingRoot = Join-Path $extractDir "cmdline-tools"
    if (-not (Test-Path -LiteralPath (Join-Path $toolingRoot "bin\\sdkmanager.bat"))) {
      throw "Unable to locate sdkmanager.bat after extracting Android command line tools."
    }

    Ensure-Directory -Path (Split-Path -Parent $latestDir)
    Move-Item -LiteralPath $toolingRoot -Destination $latestDir
  }

  $licensesDir = Join-Path $sdkRoot "licenses"
  Ensure-Directory -Path $licensesDir

  Write-Step "Writing Android SDK license fingerprints"
  Set-Content -LiteralPath (Join-Path $licensesDir "android-sdk-license") -Encoding ASCII -Value @(
    "24333f8a63b6825ea9c5514f83c2829b004d1fee",
    "d56f5187479451eabf01fb78af6dfcb131a6481e",
    "8933bad161af4178b1185d1a37fbf41ea5269c55"
  )
  Set-Content -LiteralPath (Join-Path $licensesDir "android-sdk-preview-license") -Encoding ASCII -Value @(
    "84831b9409646a918e30573bab4c9c91346d8abd"
  )

  $requiredSdkArtifacts = @(
    (Join-Path $sdkRoot "platform-tools\\adb.exe"),
    (Join-Path $sdkRoot "platforms\\android-35\\android.jar"),
    (Join-Path $sdkRoot "build-tools\\35.0.0\\apksigner.bat")
  )

  if ($requiredSdkArtifacts | Where-Object { -not (Test-Path -LiteralPath $_) }) {
    Write-Step "Installing Android SDK packages"
    & $sdkManager --sdk_root=$sdkRoot "platform-tools" "platforms;android-35" "build-tools;35.0.0"
    if ($LASTEXITCODE -ne 0) {
      throw "Android SDK package installation failed."
    }
  } else {
    Write-Step "Android SDK packages already installed"
  }

  return $sdkRoot
}

function Find-GradleHome {
  param([string]$SearchRoot)

  $gradleBat = Get-ChildItem -Path $SearchRoot -File -Filter gradle.bat -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $gradleBat) {
    return $null
  }

  $binDir = Split-Path -Path $gradleBat.FullName -Parent
  return Split-Path -Path $binDir -Parent
}

function Ensure-GradleHome {
  param([string]$BaseDir)

  $gradleRoot = Join-Path $BaseDir "gradle"
  $downloadsDir = Join-Path $BaseDir "downloads"
  $zipPath = Join-Path $downloadsDir "gradle-8.11.1-all.zip"
  $extractDir = Join-Path $gradleRoot "extract"

  Ensure-Directory -Path $gradleRoot
  Ensure-Directory -Path $downloadsDir

  $gradleHome = Find-GradleHome -SearchRoot $gradleRoot
  if ($gradleHome) {
    return $gradleHome
  }

  Write-Step "Downloading Gradle 8.11.1"
  Download-File -Url "https://downloads.gradle.org/distributions/gradle-8.11.1-all.zip" -Destination $zipPath

  if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }

  Ensure-Directory -Path $extractDir
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $gradleHome = Find-GradleHome -SearchRoot $extractDir
  if (-not $gradleHome) {
    throw "Unable to locate gradle.bat after extracting the Gradle distribution."
  }

  return $gradleHome
}

function Write-LocalProperties {
  param(
    [string]$RepoRoot,
    [string]$SdkRoot
  )

  $localPropertiesPath = Join-Path $RepoRoot "android\\local.properties"
  $sdkLine = "sdk.dir=$($SdkRoot -replace '\\', '/')"
  Set-Content -LiteralPath $localPropertiesPath -Value $sdkLine -Encoding ASCII
}

$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$packageJsonPath = Join-Path $resolvedProjectRoot "package.json"
$capacitorConfigPath = Join-Path $resolvedProjectRoot "capacitor.config.json"
$gradleWrapperPath = Join-Path $resolvedProjectRoot "android\\gradlew.bat"

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  throw "package.json was not found under $resolvedProjectRoot"
}

if (-not (Test-Path -LiteralPath $capacitorConfigPath)) {
  throw "capacitor.config.json was not found under $resolvedProjectRoot"
}

if (-not (Test-Path -LiteralPath $gradleWrapperPath)) {
  throw "android\\gradlew.bat was not found under $resolvedProjectRoot"
}

$javaHome = Ensure-JavaHome -BaseDir $ToolsRoot
$sdkRoot = Ensure-AndroidSdk -BaseDir $ToolsRoot
$gradleHome = Ensure-GradleHome -BaseDir $ToolsRoot

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$systemPaths = "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem"
$env:Path = "$systemPaths;$javaHome\\bin;$sdkRoot\\platform-tools;$sdkRoot\\cmdline-tools\\latest\\bin;$gradleHome\\bin;$env:Path"

Write-LocalProperties -RepoRoot $resolvedProjectRoot -SdkRoot $sdkRoot

Push-Location $resolvedProjectRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedProjectRoot "node_modules"))) {
    throw "node_modules is missing. Run npm install before invoking this helper."
  }

  if (-not $SkipWebBuild) {
    Write-Step "Building the H5 bundle for Capacitor"
    & npm.cmd run build:app:web
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build:app:web failed."
    }
  }

  Write-Step "Syncing Capacitor Android assets"
  & .\\node_modules\\.bin\\cap.cmd sync android
  if ($LASTEXITCODE -ne 0) {
    throw "Capacitor Android sync failed."
  }

  $gradleTask = if ($BuildType -eq "Release") { "assembleRelease" } else { "assembleDebug" }
  Write-Step "Running Gradle task $gradleTask"
  & (Join-Path $gradleHome "bin\\gradle.bat") -p .\\android $gradleTask
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle task $gradleTask failed."
  }
}
finally {
  Pop-Location
}

$apkDir = if ($BuildType -eq "Release") {
  Join-Path $resolvedProjectRoot "android\\app\\build\\outputs\\apk\\release"
} else {
  Join-Path $resolvedProjectRoot "android\\app\\build\\outputs\\apk\\debug"
}

$artifacts = Get-ChildItem -LiteralPath $apkDir -Filter *.apk -Recurse -ErrorAction SilentlyContinue
if (-not $artifacts) {
  throw "Gradle finished but no APK was found under $apkDir"
}

Write-Step "APK output"
$artifacts | ForEach-Object { Write-Host $_.FullName -ForegroundColor Green }
