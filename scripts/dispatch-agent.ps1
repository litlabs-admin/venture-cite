<#
.SYNOPSIS
  Dispatch one Codex worker or reviewer against a task brief, with the standing
  agent contract attached and a schema-validated report written to disk.

.DESCRIPTION
  Every flag that governs model, effort and sandbox is passed EXPLICITLY. This is
  deliberate: `codex exec -p <profile>` silently ignores unknown profile names and
  does not read .codex/agents/*.toml, so relying on profiles or defaults is unsafe.

  Reviewers are forced to read-only by the sandbox, not by instruction.

.EXAMPLE
  ./scripts/dispatch-agent.ps1 -Task 3 -Role implementer -Model luna -Effort high

.EXAMPLE
  ./scripts/dispatch-agent.ps1 -Task 3 -Role reviewer -Model terra -Effort max
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Task,
  [Parameter(Mandatory)] [ValidateSet('implementer','reviewer')] [string] $Role,
  [ValidateSet('luna','terra')] [string] $Model = 'luna',
  [ValidateSet('low','medium','high','max')] [string] $Effort = 'high',
  [string] $WorkDir = $PSScriptRoot | Split-Path -Parent,
  [string] $Suffix = ''
)

$ErrorActionPreference = 'Stop'

# xhigh and ultra are documented by OpenAI but HARD-ERROR on this account:
#   "spawn allowlist - V2 accepts only V2-capable presets and hard-errors"
# ValidateSet above deliberately excludes them. Verified 2026-08-27, cli 0.150.0.

$repo     = Resolve-Path $WorkDir
$slug     = "task-$Task$Suffix"
$sddDir   = Join-Path $repo ".superpowers\sdd\backend-remediation"
$schemas  = Join-Path $repo ".superpowers\schemas"
$contract = "docs/superpowers/AGENT-CONTRACT.md"

$modelSlug = @{ luna = 'gpt-5.6-luna'; terra = 'gpt-5.6-terra' }[$Model]

if ($Role -eq 'implementer') {
  $sandbox = 'workspace-write'
  $schema  = Join-Path $schemas 'task-report.json'
  $report  = Join-Path $sddDir  "$slug-report.json"
  $brief   = ".superpowers/sdd/backend-remediation/$slug-brief.md"
  $verb    = "Implement exactly what it specifies."
} else {
  $sandbox = 'read-only'
  $schema  = Join-Path $schemas 'review-verdict.json'
  $report  = Join-Path $sddDir  "$slug-review.json"
  $brief   = ".superpowers/sdd/backend-remediation/$slug-review-prompt.md"
  $verb    = "Carry out the review it specifies. Do not modify any file."
}

foreach ($p in @($schema)) {
  if (-not (Test-Path $p)) { throw "Missing schema: $p" }
}
if (-not (Test-Path (Join-Path $repo $brief))) { throw "Missing brief: $brief" }
if (-not (Test-Path (Join-Path $repo $contract))) { throw "Missing contract: $contract" }

New-Item -ItemType Directory -Force -Path $sddDir | Out-Null
if (Test-Path $report) { Remove-Item $report }

$prompt = @"
Read $contract first - it is the standing contract for every agent on this project.
Then read $brief - it is your complete requirements for this task.
$verb
Do not read any other plan file. Do not touch files your brief does not name.
Do not commit. Do not dispatch subagents.
"@

$log = Join-Path $env:TEMP "$slug-$Role.log"

Write-Host "dispatch  $slug  role=$Role  model=$modelSlug  effort=$Effort  sandbox=$sandbox"
Write-Host "  brief   $brief"
Write-Host "  report  $report"
Write-Host "  log     $log"

Push-Location $repo
try {
  & codex exec `
      -m $modelSlug `
      -c model_reasoning_effort="$Effort" `
      -s $sandbox `
      --output-schema $schema `
      -o $report `
      $prompt *> $log
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

Write-Host "exit: $code"

if (Test-Path $report) {
  Write-Host "`n--- report ---"
  Get-Content $report -Raw
} else {
  Write-Host "`nNO REPORT WRITTEN - last 20 log lines:"
  Get-Content $log -Tail 20
  exit 1
}
