# setup-memory-task.ps1 - register a scheduled task that runs memory-tick.ps1.
# ASCII only. Self-elevates when needed.
$ErrorActionPreference = 'Stop'
$TaskName = 'DSH Memory Kit Tick'
$Script   = Join-Path $PSScriptRoot 'memory-tick.ps1'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host 'elevation required; launching an administrator window...'
  $argLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  Start-Process -FilePath 'powershell.exe' -ArgumentList $argLine -Verb RunAs
  exit 0
}

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $Script + '"')
$start  = (Get-Date).Date.AddMinutes(5)
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host ''
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, @{n='Enabled';e={$_.Settings.Enabled}} | Format-Table -AutoSize
Write-Host ('registered: ' + $TaskName + ' (every 30 minutes)')
