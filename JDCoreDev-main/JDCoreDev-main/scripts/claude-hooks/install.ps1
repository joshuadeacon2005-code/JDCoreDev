# Installer for the JDCoreDev Claude Code auto-logging hook (Windows).
#
# Usage (run from this directory in PowerShell):
#   .\install.ps1 -ApiKey "<your JDCD_DEV_LOG_KEY>"
#
# What it does:
#   1. Copies the hook scripts to %USERPROFILE%\.claude\hooks\jdcd\
#   2. Sets the JDCD_DEV_LOG_KEY user env var
#   3. Patches %USERPROFILE%\.claude\settings.json to register Stop + SessionEnd hooks
#   4. Registers a Windows scheduled task that runs the watcher every 2 minutes
#
# Re-running is safe — each step is idempotent.

param(
  [Parameter(Mandatory=$true)] [string]$ApiKey,
  [string]$Endpoint = "https://jdcoredev.com/api/dev-logs/ingest",
  [int]$IdleMinutes = 30,
  [int]$WatcherEverySeconds = 120
)

$ErrorActionPreference = "Stop"

$src        = $PSScriptRoot
$hooksDir   = Join-Path $env:USERPROFILE ".claude\hooks\jdcd"
$settingsFp = Join-Path $env:USERPROFILE ".claude\settings.json"

# 1. Copy scripts
New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
Copy-Item -Path (Join-Path $src "lib.mjs")     -Destination $hooksDir -Force
Copy-Item -Path (Join-Path $src "hook.mjs")    -Destination $hooksDir -Force
Copy-Item -Path (Join-Path $src "watcher.mjs") -Destination $hooksDir -Force
Copy-Item -Path (Join-Path $src "link.mjs")    -Destination $hooksDir -Force
Write-Host "Copied hook scripts to $hooksDir"

# 2. Env vars (User scope so they persist for new processes)
[Environment]::SetEnvironmentVariable("JDCD_DEV_LOG_KEY", $ApiKey, "User")
[Environment]::SetEnvironmentVariable("JDCD_DEV_LOG_ENDPOINT", $Endpoint, "User")
[Environment]::SetEnvironmentVariable("JDCD_IDLE_MINUTES", "$IdleMinutes", "User")
Write-Host "Set env vars: JDCD_DEV_LOG_KEY, JDCD_DEV_LOG_ENDPOINT, JDCD_IDLE_MINUTES"

# 3. Patch settings.json
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  throw "node was not found in PATH. Install Node.js (https://nodejs.org) and re-run."
}
$hookScript = Join-Path $hooksDir "hook.mjs"
$cmd = "`"$nodeExe`" `"$hookScript`""

if (Test-Path $settingsFp) {
  $existing = Get-Content $settingsFp -Raw
  $settings = if ($existing.Trim()) { $existing | ConvertFrom-Json } else { @{} }
} else {
  New-Item -ItemType Directory -Path (Split-Path $settingsFp) -Force | Out-Null
  $settings = New-Object -TypeName PSObject
}

if (-not (Get-Member -InputObject $settings -Name "hooks" -MemberType Properties)) {
  Add-Member -InputObject $settings -MemberType NoteProperty -Name "hooks" -Value (New-Object -TypeName PSObject)
}

function Set-HookEvent {
  param($settings, [string]$eventName, [string]$cmd)
  $hookEntry = [PSCustomObject]@{
    matcher = ""
    hooks   = @(
      [PSCustomObject]@{
        type    = "command"
        command = $cmd
      }
    )
  }
  if (Get-Member -InputObject $settings.hooks -Name $eventName -MemberType Properties) {
    $existing = $settings.hooks.$eventName
    $alreadyHas = $false
    foreach ($e in $existing) {
      foreach ($h in $e.hooks) {
        if ($h.command -eq $cmd) { $alreadyHas = $true }
      }
    }
    if (-not $alreadyHas) {
      $settings.hooks.$eventName = @($existing) + @($hookEntry)
    }
  } else {
    Add-Member -InputObject $settings.hooks -MemberType NoteProperty -Name $eventName -Value @($hookEntry)
  }
}

Set-HookEvent -settings $settings -eventName "Stop"       -cmd $cmd
Set-HookEvent -settings $settings -eventName "SessionEnd" -cmd $cmd

$settings | ConvertTo-Json -Depth 20 | Set-Content -Path $settingsFp -Encoding UTF8
Write-Host "Patched $settingsFp"

# 4. Scheduled task for watcher
$taskName = "JDCoreDev-DevLog-Watcher"
$watcherScript = Join-Path $hooksDir "watcher.mjs"
$taskAction = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$watcherScript`""
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(60) `
  -RepetitionInterval (New-TimeSpan -Seconds $WatcherEverySeconds) `
  -RepetitionDuration ([TimeSpan]::MaxValue)
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

# Unregister existing task if present, then register fresh
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger `
  -Settings $taskSettings -Principal $taskPrincipal `
  -Description "JDCoreDev Claude Code auto-logging idle flush watcher" | Out-Null
Write-Host "Registered scheduled task '$taskName' (every $WatcherEverySeconds seconds)"

Write-Host ""
Write-Host "===== Install complete ====="
Write-Host "Next steps:"
Write-Host "  1. Open a NEW terminal so env vars are picked up"
Write-Host "  2. In each project you want logged, run:"
Write-Host "       node `"$hooksDir\link.mjs`" <projectId>"
Write-Host "  3. Verify connectivity:"
Write-Host "       Invoke-RestMethod -Method Get -Uri `"$Endpoint`".Replace('/ingest','/ping') ``"
Write-Host "         -Headers @{'x-jdcd-key'='$ApiKey'}"
