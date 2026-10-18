# memory-tick.ps1 - run the memory pipeline (index, audit, topics, snapshots, size).
# ASCII only. Safe to run from Task Scheduler.
$ErrorActionPreference = 'Continue'
$Root  = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root 'tools'
$Mine  = if ($env:DSH_MEMORY_HOME) { $env:DSH_MEMORY_HOME } else { Join-Path $Root 'memory' }
$Node  = if ($env:DSH_MEMORY_NODE) { $env:DSH_MEMORY_NODE } else { 'node' }
$LogDir = Join-Path $Mine 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$Log = Join-Path $LogDir 'memory-tick.log'

function Write-Tick([string]$msg) {
  $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
}

# Make the node tools resolve the same workspace/memory dirs as this script.
$env:DSH_MEMORY_HOME = $Mine
$env:DSH_MEMORY_WORKSPACE = $Root

# cmd.exe redirects bytes directly, so node's UTF-8 output is not re-encoded by
# PowerShell (which would otherwise produce UTF-16 and mojibake).
function Invoke-Node([string]$name, [string]$extra = '') {
  $cmdLine = '"' + $Node + '" "' + (Join-Path $Tools $name) + '"'
  if ($extra -ne '') { $cmdLine += ' ' + $extra }
  $cmdLine += ' >> "' + $Log + '" 2>&1'
  cmd.exe /c $cmdLine | Out-Null
  return $LASTEXITCODE
}

Write-Tick 'tick start'
Write-Tick ('recall-index exit=' + (Invoke-Node 'recall-index.mjs'))
Write-Tick ('audit-compile exit=' + (Invoke-Node 'audit-compile.mjs'))
Write-Tick ('compaction-watch exit=' + (Invoke-Node 'compaction-watch.mjs'))
Write-Tick ('topics exit=' + (Invoke-Node 'topics.mjs' 'build'))
Write-Tick ('check-size exit=' + (Invoke-Node 'check-size.mjs'))
Write-Tick 'tick done'
