# Build Script for Lucid IDE Setup Installer

$cscPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe"

if (-not (Test-Path $cscPath)) {
    Write-Error "C# compiler not found at: $cscPath"
    Exit 1
}

$src    = Join-Path $PSScriptRoot "LucidSetup.cs"
$out    = Join-Path $PSScriptRoot "LucidSetup.exe"
$icon   = Join-Path $PSScriptRoot "lucid.ico"

Write-Host "Compiling LucidSetup.exe..." -ForegroundColor Cyan

$args = @(
    "/target:winexe",
    "/optimize+",
    "/out:$out",
    "/r:System.IO.Compression.FileSystem.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.Net.Http.dll",
    "/r:Microsoft.CSharp.dll"
)

if (Test-Path $icon) {
    $args += "/win32icon:$icon"
    Write-Host "  Using icon: $icon" -ForegroundColor Gray
}

$args += $src

& $cscPath @args

if ($LASTEXITCODE -eq 0 -and (Test-Path $out)) {
    $kb = [math]::Round((Get-Item $out).Length / 1KB, 0)
    Write-Host "Build succeeded! Output: $out ($kb KB)" -ForegroundColor Green
} else {
    Write-Error "Compilation failed."
    Exit 1
}
