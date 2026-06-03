# Build Script for Lucid IDE Setup Installer
param (
    [string]$Version = ""
)

$cscPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe"

if (-not (Test-Path $cscPath)) {
    Write-Error "C# compiler not found at: $cscPath"
    Exit 1
}

# Determine Version
if ([string]::IsNullOrEmpty($Version)) {
    if (-not [string]::IsNullOrEmpty($env:RELEASE_VERSION)) {
        $Version = $env:RELEASE_VERSION
    } else {
        $envFile = Join-Path $PSScriptRoot "..\dev\build.env"
        if (Test-Path $envFile) {
            $content = Get-Content $envFile
            foreach ($line in $content) {
                if ($line -match "^RELEASE_VERSION=`"(.+?)`"") {
                    $Version = $Matches[1]
                    break
                }
            }
        }
    }
}

if ([string]::IsNullOrEmpty($Version)) {
    $Version = "1.0.1"
}

# Strip any leading 'v' or suffixes if necessary
$Version = $Version.Trim().TrimStart('v')

Write-Host "Determined Version: $Version" -ForegroundColor Green

$src         = Join-Path $PSScriptRoot "LucidSetup.cs"
$out         = Join-Path $PSScriptRoot "LucidSetup.exe"
$icon        = Join-Path $PSScriptRoot "lucid.ico"
$versionFile = Join-Path $PSScriptRoot "Version.cs"

# Generate Version.cs dynamically
$versionSrc = @"
namespace LucidInstaller
{
    public static class BuildInfo
    {
        public const string Version = "$Version";
    }
}
"@
Set-Content -Path $versionFile -Value $versionSrc -Encoding UTF8

Write-Host "Compiling LucidSetup.exe..." -ForegroundColor Cyan

$cscArgs = @(
    "/target:winexe",
    "/optimize+",
    "/out:$out",
    "/r:System.IO.Compression.FileSystem.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.Net.Http.dll",
    "/r:Microsoft.CSharp.dll"
)

if (Test-Path $icon) {
    $cscArgs += "/win32icon:$icon"
    Write-Host "  Using icon: $icon" -ForegroundColor Gray
}

$cscArgs += $src
$cscArgs += $versionFile

try {
    & $cscPath @cscArgs

    if ($LASTEXITCODE -eq 0 -and (Test-Path $out)) {
        $kb = [math]::Round((Get-Item $out).Length / 1KB, 0)
        Write-Host "Build succeeded! Output: $out ($kb KB)" -ForegroundColor Green
    } else {
        Write-Error "Compilation failed."
        Exit 1
    }
}
finally {
    if (Test-Path $versionFile) {
        Remove-Item $versionFile -Force
    }
}
