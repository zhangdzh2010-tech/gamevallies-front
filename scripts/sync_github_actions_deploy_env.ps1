param(
  [string]$RepoPath = (Get-Location).Path,
  [string]$EnvFile = '.env.deploy',
  [string]$Repo = '',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Load-EnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') {
      continue
    }

    $name, $value = $line -split '=', 2
    $name = $name.Trim()
    $value = if ($null -ne $value) { $value.Trim() } else { '' }

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$name] = $value
  }

  return $values
}

function Resolve-GitHubRepo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,

    [Parameter()]
    [string]$ExplicitRepo = ''
  )

  if ($ExplicitRepo) {
    return $ExplicitRepo
  }

  Push-Location $WorkingDirectory
  try {
    $originUrl = (git remote get-url origin).Trim()
  }
  finally {
    Pop-Location
  }

  if ($originUrl -match '^git@github\.com:(.+?)(?:\.git)?$') {
    return $Matches[1]
  }

  if ($originUrl -match '^https://github\.com/(.+?)(?:\.git)?$') {
    return $Matches[1]
  }

  throw "Unsupported origin url: $originUrl"
}

function Get-GhCliPath {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    return $gh.Source
  }

  $candidates = @(
    'C:\Program Files\GitHub CLI\gh.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\GitHub CLI\gh.exe')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "GitHub CLI 'gh' is not installed or not in PATH."
}

function Set-GitHubSecret {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoName,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $ghCli = Get-GhCliPath
  & $ghCli secret set $Name --repo $RepoName --body $Value
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set GitHub Actions secret: $Name"
  }
}

function Set-GitHubVariable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoName,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $ghCli = Get-GhCliPath
  & $ghCli variable set $Name --repo $RepoName --body $Value
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set GitHub Actions variable: $Name"
  }
}

$repoRoot = (Resolve-Path -LiteralPath $RepoPath).Path
$envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $repoRoot $EnvFile }
$envValues = Load-EnvFile -Path $envPath
$repoName = Resolve-GitHubRepo -WorkingDirectory $repoRoot -ExplicitRepo $Repo

$requiredSecrets = @(
  'VOLCENGINE_ACCESS_KEY',
  'VOLCENGINE_SECRET_KEY',
  'VOLCENGINE_REGISTRY_USERNAME',
  'VOLCENGINE_REGISTRY_PASSWORD'
)

foreach ($secretName in $requiredSecrets) {
  if (-not $envValues.ContainsKey($secretName) -or [string]::IsNullOrWhiteSpace($envValues[$secretName])) {
    throw "Missing required deploy secret in env file: $secretName"
  }
}

$actionVariables = [ordered]@{
  VOLCENGINE_REGION = if ($envValues.ContainsKey('VOLCENGINE_REGION')) { $envValues['VOLCENGINE_REGION'] } else { 'cn-shanghai' }
  VOLCENGINE_REGISTRY = if ($envValues.ContainsKey('VOLCENGINE_REGISTRY')) { $envValues['VOLCENGINE_REGISTRY'] } else { '' }
  VOLCENGINE_REGISTRY_NAMESPACE = if ($envValues.ContainsKey('VOLCENGINE_REGISTRY_NAMESPACE')) { $envValues['VOLCENGINE_REGISTRY_NAMESPACE'] } else { '' }
  IMAGE_NAME = 'gv-frontend'
  FUNC_ID = 'tsrtwmbw'
  PORT = '8080'
}

foreach ($optionalVar in @('VOLCENGINE_VPC_ID', 'VOLCENGINE_SUBNET_ID', 'VOLCENGINE_SECURITY_GROUP_ID')) {
  if ($envValues.ContainsKey($optionalVar) -and -not [string]::IsNullOrWhiteSpace($envValues[$optionalVar])) {
    $actionVariables[$optionalVar] = $envValues[$optionalVar]
  }
}

if ($DryRun) {
  Write-Output "Repo: $repoName"
  Write-Output "Secrets:"
  $requiredSecrets | ForEach-Object { Write-Output "  $_" }
  Write-Output "Variables:"
  $actionVariables.Keys | ForEach-Object { Write-Output "  $_" }
  exit 0
}

$null = Get-GhCliPath

Write-Output "Syncing deploy secrets to GitHub repo: $repoName"
foreach ($secretName in $requiredSecrets) {
  Set-GitHubSecret -RepoName $repoName -Name $secretName -Value $envValues[$secretName]
  Write-Output "  secret synced: $secretName"
}

Write-Output "Syncing deploy variables to GitHub repo: $repoName"
foreach ($entry in $actionVariables.GetEnumerator()) {
  if ([string]::IsNullOrWhiteSpace([string]$entry.Value)) {
    continue
  }

  Set-GitHubVariable -RepoName $repoName -Name $entry.Key -Value ([string]$entry.Value)
  Write-Output "  variable synced: $($entry.Key)"
}

Write-Output 'Done.'
