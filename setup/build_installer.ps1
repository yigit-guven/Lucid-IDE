# Build Script for Lucid IDE Web Installer (C#)

$cscPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe"

if (-not (Test-Path $cscPath)) {
    Write-Error "Could not find C# compiler csc.exe at: $cscPath"
    Exit 1
}

$sourceFile = Join-Path $PSScriptRoot "LucidSetup.cs"
$outputFile = Join-Path $PSScriptRoot "LucidSetup.exe"

Write-Host "Compiling LucidSetup.cs using C# compiler..." -ForegroundColor Cyan

# Invoke compiler
# /target:winexe ensures it compiles as a Windows GUI application (no command prompt shown on run)
# /optimize+ turns on optimization
# /r:System.IO.Compression.FileSystem.dll adds reference for zip extract
# /r:System.Net.Http.dll adds reference for http client
& $cscPath /target:winexe /optimize+ /out:$outputFile /r:System.IO.Compression.FileSystem.dll /r:System.Net.Http.dll $sourceFile

if ($LASTEXITCODE -eq 0 -and (Test-Path $outputFile)) {
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "Output: $outputFile" -ForegroundColor Green
} else {
    Write-Error "Compilation failed."
    Exit 1
}
