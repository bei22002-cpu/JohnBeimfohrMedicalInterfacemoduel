#Requires -Version 5.1
<#
.SYNOPSIS
  Initialize git (if needed), commit all tracked files, set origin, and print push instructions for a PUBLIC GitHub repo.

.PARAMETER RemoteUrl
  HTTPS or SSH URL of an empty GitHub repo you already created, e.g.
  https://github.com/YOURUSER/your-repo.git

.PARAMETER CommitMessage
  Message for the initial commit (if there are staged changes).

.PARAMETER SkipCommit
  Skip commit step (only init / remote).

.EXAMPLE
  .\scripts\publish-to-github.ps1 -RemoteUrl https://github.com/jmbei/cardiology-exam-room-viz.git
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $RemoteUrl,

  [string] $CommitMessage = "Initial public import",

  [switch] $SkipCommit
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path (Join-Path $root "package.json"))) {
  throw "Could not find package.json — run this script from the project clone (scripts/ is under repo root)."
}

Set-Location -LiteralPath $root
Write-Host "Repository root: $root"

if (-not (Test-Path (Join-Path $root ".git"))) {
  git init
  git branch -M main
  Write-Host "Initialized new git repository (main)."
}
else {
  Write-Host "Git repository already exists."
}

git add -A
$status = git status --porcelain
if (-not $status) {
  Write-Host "Nothing to commit (working tree clean)."
}
elseif (-not $SkipCommit) {
  git commit -m $CommitMessage
}

$null = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  $cur = git remote get-url origin
  Write-Host "Remote 'origin' was: $cur — setting to: $RemoteUrl"
  git remote set-url origin $RemoteUrl
}
else {
  git remote add origin $RemoteUrl
}

Write-Host @"

Done. Create an empty PUBLIC repo on GitHub (no README) if you have not:
  https://github.com/new

Then push:
  git push -u origin main

Large local atlas checkouts are ignored (see .gitignore: content/meshes/TorontoHeartAtlas/repo/).

"@
