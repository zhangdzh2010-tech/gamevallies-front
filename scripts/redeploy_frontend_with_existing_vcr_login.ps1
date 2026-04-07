param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath,

  [switch]$SkipBuild,

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
  [Environment]::SetEnvironmentVariable('SKIP_DOCKER_LOGIN', '1', 'Process')
  $loaded['PYTHONUTF8'] = '1'
  $loaded['PYTHONIOENCODING'] = 'utf-8'
  $loaded['SKIP_DOCKER_LOGIN'] = '1'

  return $loaded
}

function Get-DockerConfigObject {
  $configPath = Join-Path $env:USERPROFILE '.docker\config.json'
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Docker config not found: $configPath"
  }

  return Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Decode-DockerAuthValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Auth
  )

  $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Auth))
  $parts = $decoded -split ':', 2
  if ($parts.Count -ne 2) {
    throw 'Invalid docker auth payload'
  }

  return @{
    Username = $parts[0]
    Password = $parts[1]
    Source = 'auths'
  }
}

function Invoke-DockerCredentialHelper {
  param(
    [Parameter(Mandatory = $true)]
    [string]$HelperName,

    [Parameter(Mandatory = $true)]
    [string]$Registry
  )

  $commands = @(
    "docker-credential-$HelperName.exe",
    "docker-credential-$HelperName"
  )

  $helperCommand = $null
  foreach ($candidate in $commands) {
    $resolved = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      $helperCommand = $resolved.Source
      break
    }
  }

  if (-not $helperCommand) {
    throw "Docker credential helper not found for $HelperName"
  }

  $payload = $Registry | & $helperCommand get
  if ($LASTEXITCODE -ne 0) {
    throw "Docker credential helper failed for $Registry"
  }

  $json = $payload | ConvertFrom-Json
  if (-not $json.Username -or -not $json.Secret) {
    throw "Docker credential helper returned empty credential for $Registry"
  }

  return @{
    Username = $json.Username
    Password = $json.Secret
    Source = "helper:$HelperName"
  }
}

function Get-RegistryCredentialFromDocker {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Registry
  )

  $config = Get-DockerConfigObject

  $authKeys = @(
    $Registry,
    "https://$Registry"
  )

  if ($config.auths) {
    foreach ($key in $authKeys) {
      $authEntry = $config.auths.PSObject.Properties | Where-Object { $_.Name -eq $key } | Select-Object -First 1
      $authValue = $null
      if ($authEntry -and $authEntry.Value -and $authEntry.Value.PSObject.Properties['auth']) {
        $authValue = [string]$authEntry.Value.PSObject.Properties['auth'].Value
      }

      if ($authValue) {
        return Decode-DockerAuthValue -Auth $authValue
      }
    }
  }

  $helperName = $null
  $credHelpersProperty = $config.PSObject.Properties['credHelpers']
  if ($credHelpersProperty -and $credHelpersProperty.Value) {
    $credHelpers = $credHelpersProperty.Value
    foreach ($key in $authKeys) {
      $helperEntry = $credHelpers.PSObject.Properties | Where-Object { $_.Name -eq $key } | Select-Object -First 1
      if ($helperEntry -and $helperEntry.Value) {
        $helperName = [string]$helperEntry.Value
        break
      }
    }
  }

  $credsStoreProperty = $config.PSObject.Properties['credsStore']
  if (-not $helperName -and $credsStoreProperty -and $credsStoreProperty.Value) {
    $helperName = [string]$credsStoreProperty.Value
  }

  if ($helperName) {
    return Invoke-DockerCredentialHelper -HelperName $helperName -Registry $Registry
  }

  throw "No Docker credential found for registry $Registry"
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
    $content = [string](& $curl -sS --max-time 30 $url)
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

$resolvedRepoPath = [System.IO.Path]::GetFullPath($RepoPath)
$envFile = Join-Path $resolvedRepoPath '.env.deploy'
$packageFile = Join-Path $resolvedRepoPath 'package.json'
$deployScript = Join-Path $resolvedRepoPath 'scripts\deploy.py'

foreach ($requiredPath in @($envFile, $packageFile, $deployScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required path not found: $requiredPath"
  }
}

$loadedEnv = Load-DeployEnvironment -EnvFile $envFile
$registry = $loadedEnv['VOLCENGINE_REGISTRY']
if (-not $registry) {
  throw 'VOLCENGINE_REGISTRY is missing from deploy env'
}

$currentCredential = Get-RegistryCredentialFromDocker -Registry $registry
[Environment]::SetEnvironmentVariable('VOLCENGINE_REGISTRY_USERNAME', $currentCredential.Username, 'Process')
[Environment]::SetEnvironmentVariable('VOLCENGINE_REGISTRY_PASSWORD', $currentCredential.Password, 'Process')

Write-Host "Loaded deploy env for registry $registry using Docker credential source $($currentCredential.Source)"

if ($SkipBuild) {
  $distDir = Join-Path $resolvedRepoPath 'dist\h5'
  if (-not (Test-Path -LiteralPath $distDir)) {
    throw 'SkipBuild was provided but dist/h5 does not exist.'
  }
}
else {
  Invoke-Step -FilePath 'npm.cmd' -ArgumentList @('run', 'build:h5') -WorkingDirectory $resolvedRepoPath
}

$filteredPatterns = @($VerifyPatterns | Where-Object { $null -ne $_ -and $_ -ne '' })

Invoke-Step -FilePath 'python' -ArgumentList @('scripts/deploy.py') -WorkingDirectory $resolvedRepoPath
Invoke-Verification -RepoRoot $resolvedRepoPath -DelaySeconds $PostDeployWaitSeconds -Patterns $filteredPatterns
