<#
.SYNOPSIS
  Builds "Chat - AI Summary to Ticket.i3WorkFlow" for import through the Architect GUI.

.DESCRIPTION
  Uses Archy (Genesys' own flow tool) to turn chat-ai-summary-to-ticket.yaml into an
  Architect import file. Archy only READS from your org (it resolves the data actions by
  name); it does not create or change any flow.

  Run this AFTER the data actions are imported and published.

.EXAMPLE
  .\Build-I3WorkFlow.ps1 -ClientId 1234abcd-...        # prompts for the client secret
#>
param(
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $ClientSecret,
    [string] $Location = 'mypurecloud.com.au',
    # Names as they appear in YOUR org. Change them if yours differ.
    [string] $GenesysIntegrationName = 'Genesys Cloud Data Actions',
    [string] $TicketIntegrationName  = 'Rabobank ITSM API PROD',
    [string] $UpdateTicketActionName = 'Update Ticket (v8)'
)
$ErrorActionPreference = 'Stop'
$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$archyDir = Join-Path $here '.archy'
$outDir   = Join-Path $here 'dist'
$archy    = Join-Path $archyDir 'archy.bat'

if (-not $ClientSecret) {
    $secure = Read-Host -AsSecureString 'OAuth client secret'
    $ClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if (-not (Test-Path $archy)) {
    Write-Host 'Downloading Archy...'
    New-Item -ItemType Directory -Force -Path $archyDir | Out-Null
    $zip = Join-Path $archyDir 'archy-win.zip'
    Invoke-WebRequest -Uri 'https://sdk-cdn.mypurecloud.com/archy/latest/archy-win.zip' -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $archyDir -Force
}

# Apply the integration / action names for this org to a working copy of the YAML.
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$yaml = Get-Content -Raw -Path (Join-Path $here 'chat-ai-summary-to-ticket.yaml')
$yaml = $yaml.Replace('                Genesys Cloud Data Actions:', "                ${GenesysIntegrationName}:")
$yaml = $yaml.Replace('                Rabobank ITSM API PROD:',     "                ${TicketIntegrationName}:")
$yaml = $yaml.Replace('                    Update Ticket (v8):',     "                    ${UpdateTicketActionName}:")
$work = Join-Path $outDir 'chat-ai-summary-to-ticket.yaml'
[IO.File]::WriteAllText($work, $yaml, (New-Object Text.UTF8Encoding($false)))

Push-Location $archyDir
try {
    & $archy createImportFile --file $work --outputDir $outDir --force `
        --clientId $ClientId --clientSecret $ClientSecret --location $Location
    if ($LASTEXITCODE -ne 0) { throw "Archy failed with exit code $LASTEXITCODE - read the messages above." }
}
finally { Pop-Location }

Write-Host ''
Write-Host 'Import this file in Architect (Save > Import):' -ForegroundColor Green
Get-ChildItem -Path $outDir -Filter '*.i3WorkFlow' | ForEach-Object { Write-Host "  $($_.FullName)" }
