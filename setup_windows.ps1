# Self-elevate the script to run as Administrator if not already elevated
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Lucid IDE Setup requires Administrator privileges." -ForegroundColor Yellow
    Write-Host "Relaunching script as Administrator..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "          LUCID IDE WINDOWS BUILD SETUP SCRIPT            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "This script will check for and install all build tools needed" -ForegroundColor Gray
Write-Host "to compile Lucid IDE on Windows using WinGet." -ForegroundColor Gray
Write-Host ""

# Check for WinGet availability
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Error: WinGet is not installed or not in the PATH." -ForegroundColor Red
    Write-Host "Please install App Installer from the Microsoft Store first." -ForegroundColor Red
    Pause
    Exit
}

# Helper function to install a package via winget
function Install-Package {
    param (
        [string]$Name,
        [string]$Id,
        [string]$CommandCheck,
        [string]$CustomArgs = ""
    )

    Write-Host "Checking for $Name..." -NoNewline -ForegroundColor Cyan
    
    $installed = $false
    if ($CommandCheck) {
        if (Get-Command $CommandCheck -ErrorAction SilentlyContinue) {
            $installed = $true
        }
    }

    # Alternative check using registry if command-check is not available (like VS Build Tools)
    if (-not $installed -and $Id -eq "Microsoft.VisualStudio.2022.BuildTools") {
        if (Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools") {
            $installed = $true
        }
    }

    if ($installed) {
        Write-Host " [ALREADY INSTALLED]" -ForegroundColor Green
    } else {
        Write-Host " [NOT FOUND]" -ForegroundColor Yellow
        Write-Host "Installing $Name ($Id)..." -ForegroundColor Gray
        
        $cmd = "winget install --id $Id -e --accept-source-agreements --accept-package-agreements"
        if ($CustomArgs) {
            $cmd += " $CustomArgs"
        }
        
        Invoke-Expression $cmd
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully installed $Name!" -ForegroundColor Green
        } else {
            Write-Host "Warning: Installation of $Name exited with code $LASTEXITCODE. You might need to install it manually." -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# 1. Install Git for Windows (provides Git Bash)
Install-Package -Name "Git for Windows" -Id "Git.Git" -CommandCheck "git"

# 2. Install JSON Processor (jq)
Install-Package -Name "JQ (JSON Processor)" -Id "jqlang.jq" -CommandCheck "jq"

# 3. Install 7-Zip
Install-Package -Name "7-Zip Packer" -Id "7zip.7zip" -CommandCheck "7z"

# 4. Install Node.js LTS
Install-Package -Name "Node.js" -Id "OpenJS.NodeJS" -CommandCheck "node"

# 5. Install Python 3.11 (required for compilation of node modules)
Install-Package -Name "Python 3.11" -Id "Python.Python.3.11" -CommandCheck "python"

# 6. Install Rustup
Install-Package -Name "Rust Toolchain (Rustup)" -Id "Rustlang.Rustup" -CommandCheck "rustup"

# 7. Install Visual Studio 2022 Build Tools with C++ compilation tools
Install-Package -Name "VS Build Tools 2022 (with C++ Workload)" -Id "Microsoft.VisualStudio.2022.BuildTools" -CommandCheck "" -CustomArgs '--override "--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended"'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                 SETUP STEPS COMPLETED                    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "All installers have run. Please follow these final steps:" -ForegroundColor Gray
Write-Host "1. Restart your machine or open a new terminal session so all new" -ForegroundColor White
Write-Host "   environment variables and PATH values take effect." -ForegroundColor White
Write-Host "2. Once restarted, run Git Bash as Administrator." -ForegroundColor White
Write-Host "3. Execute the build command:" -ForegroundColor White
Write-Host "   bash ./dev/build.sh -s" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Cyan
[void][System.Console]::ReadKey($true)
