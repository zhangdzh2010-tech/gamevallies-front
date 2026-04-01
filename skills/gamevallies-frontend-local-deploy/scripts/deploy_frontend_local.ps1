param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath,

  [switch]$SkipBuild,

  [switch]$DryRun,

  [int]$PostDeployWaitSeconds = 90,

  [string[]]$VerifyPatterns = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter()]
    [string[]]$ArgumentList = @(),

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
  }
  finally {
    Pop-Location
  }
}

function Load-DeployEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFile
  )

  $loaded = @{}
  foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') {
      continue
    }

    $name, $value = $line -split '=', 2
    $name = $name.Trim()
    $value = if ($null -ne $value) { $value.Trim() } else { '' }

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    $loaded[$name] = $value
  }

  [Environment]::SetEnvironmentVariable('PYTHONUTF8', '1', 'Process')
  [Environment]::SetEnvironmentVariable('PYTHONIOENCODING', 'utf-8', 'Process')
  $loaded['PYTHONUTF8'] = '1'
  $loaded['PYTHONIOENCODING'] = 'utf-8'

  return $loaded
}

function Get-PatternCount {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Content,

    [Parameter(Mandatory = $true)]
    [string[]]$Patterns
  )

  $count = 0
  foreach ($pattern in $Patterns) {
    $count += [regex]::Matches($Content, [regex]::Escape($pattern)).Count
  }
  return $count
}

function Invoke-Verification {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [int]$DelaySeconds,

    [Parameter()]
    [string[]]$Patterns = @()
  )

  if ($DelaySeconds -gt 0) {
    Start-Sleep -Seconds $DelaySeconds
  }

  $curl = 'C:\Windows\System32\curl.exe'
  if (-not (Test-Path -LiteralPath $curl)) {
    throw "curl.exe not found at $curl"
  }

  Write-Host 'Checking production health...'
  & $curl -sS -i --max-time 20 'https://gamevallies.com/api/v1/health'
  if ($LASTEXITCODE -ne 0) {
    throw 'Health check failed.'
  }

  if (-not $Patterns -or $Patterns.Count -eq 0) {
    return
  }

  $targets = @('js/app.js')
  $chunkDir = Join-Path $RepoRoot 'dist\h5\chunk'
  if (Test-Path -LiteralPath $chunkDir) {
    $targets += Get-ChildItem -LiteralPath $chunkDir -Filter '*.js' | ForEach-Object { "chunk/$($_.Name)" }
  }

  $matched = $false
  foreach ($target in $targets) {
    $url = "https://gamevallies.com/$target"
    $content = & $curl -sS --max-time 30 $url
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Failed to fetch $url"
      continue
    }

    $count = Get-PatternCount -Content $content -Patterns $Patterns
    if ($count -gt 0) {
      $matched = $true
      Write-Host "$target => $count matches"
    }
  }

  if (-not $matched) {
    Write-Warning 'No verification patterns were found in the live bundle yet.'
  }
}

$repoRoot = [System.IO.Path]::GetFullPath($RepoPath)
$envFile = Join-Path $repoRoot '.env.deploy'
$packageFile = Join-Path $repoRoot 'package.json'
$deployScript = Join-Path $repoRoot 'scripts\deploy.py'
$distDir = Join-Path $repoRoot 'dist\h5'

foreach ($requiredPath in @($packageFile, $envFile, $deployScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required path not found: $requiredPath"
  }
}

$loadedEnv = Load-DeployEnvironment -EnvFile $envFile
Write-Host "Loaded deploy env for registry $($loadedEnv['VOLCENGINE_REGISTRY']) as user $($loadedEnv['VOLCENGINE_REGISTRY_USERNAME'])"

if (-not $SkipBuild) {
  if ($DryRun) {
    Write-Host '[dry-run] would run: npm.cmd run build:h5'
  }
  else {
    Invoke-Step -FilePath 'npm.cmd' -ArgumentList @('run', 'build:h5') -WorkingDirectory $repoRoot
  }
}
elseif (-not (Test-Path -LiteralPath $distDir)) {
  throw 'SkipBuild was provided but dist/h5 does not exist.'
}

if ($DryRun) {
  Write-Host '[dry-run] would run: python scripts/deploy.py'
  if ($VerifyPatterns.Count -gt 0) {
    Write-Host "[dry-run] would verify patterns: $($VerifyPatterns -join ', ')"
  }
  return
}

Invoke-Step -FilePath 'python' -ArgumentList @('scripts/deploy.py') -WorkingDirectory $repoRoot
Invoke-Verification -RepoRoot $repoRoot -DelaySeconds $PostDeployWaitSeconds -Patterns $VerifyPatterns


