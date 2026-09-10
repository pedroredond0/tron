# scripts/build-windows.ps1
# tronExplorer Portable Build Script for Windows
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  tronExplorer - Build Windows (MSVC x64) " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Check Rust & Cargo
$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCmd) {
    if (Test-Path "$HOME\.cargo\bin\cargo.exe") {
        $env:PATH = "$HOME\.cargo\bin;$env:PATH"
        Write-Host "[+] Cargo encontrado en: $HOME\.cargo\bin" -ForegroundColor Green
    } else {
        Write-Error "Cargo/Rust no se encuentra instalado en el sistema."
        exit 1
    }
} else {
    Write-Host "[+] Cargo encontrado en PATH: $($cargoCmd.Source)" -ForegroundColor Green
}

# 2. Check rustc toolchain is MSVC
$toolchainInfo = & rustc -Vv
Write-Host "[+] Informacion de toolchain Rust:" -ForegroundColor Gray
$toolchainInfo | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

if ($toolchainInfo -notmatch "host:.*-msvc") {
    Write-Warning "El toolchain por defecto no parece ser MSVC. Ajustando a stable-x86_64-pc-windows-msvc..."
    & rustup default stable-x86_64-pc-windows-msvc
}

# 3. Locate Visual Studio / Build Tools VsDevCmd.bat
$vsDevCmd = $null
$possibleVsDevCmd = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
)

foreach ($path in $possibleVsDevCmd) {
    if (Test-Path $path) {
        $vsDevCmd = $path
        break
    }
}

if (-not $vsDevCmd) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installPath -and (Test-Path "$installPath\Common7\Tools\VsDevCmd.bat")) {
            $vsDevCmd = "$installPath\Common7\Tools\VsDevCmd.bat"
        }
    }
}

if (-not $vsDevCmd) {
    Write-Error "No se encontro VsDevCmd.bat. Asegurate de tener Visual Studio 2022 o C++ Build Tools instalado."
    exit 1
}

Write-Host "[+] VsDevCmd.bat encontrado en: $vsDevCmd" -ForegroundColor Green

# 4. Initialize MSVC Environment in current session if cl/link not present
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue) -or -not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Inicializando entorno MSVC (arch=x64)..." -ForegroundColor Yellow
    $tempFile = [System.IO.Path]::GetTempFileName()
    cmd /c "`"$vsDevCmd`" -arch=x64 && set > `"$tempFile`""
    Get-Content $tempFile | ForEach-Object {
        if ($_ -match '^(.*?)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}

# 5. Check cl.exe and link.exe
$clCmd = Get-Command cl.exe -ErrorAction SilentlyContinue
$linkCmd = Get-Command link.exe -ErrorAction SilentlyContinue

if (-not $clCmd -or -not $linkCmd) {
    Write-Error "cl.exe o link.exe no estan disponibles tras inicializar VsDevCmd.bat."
    exit 1
}
Write-Host "[+] cl.exe: $($clCmd.Source)" -ForegroundColor Green
Write-Host "[+] link.exe: $($linkCmd.Source)" -ForegroundColor Green

# 6. Check Tauri CLI
$tauriCmd = Get-Command cargo-tauri.exe -ErrorAction SilentlyContinue
if (-not $tauriCmd) {
    if (Test-Path "$HOME\.cargo\bin\cargo-tauri.exe") {
        Write-Host "[+] cargo-tauri encontrado en .cargo/bin" -ForegroundColor Green
    } else {
        Write-Host "[*] Instalando cargo tauri-cli..." -ForegroundColor Yellow
        & cargo install tauri-cli --version "^2"
    }
}

# 7. Execute Build: cargo tauri build --no-bundle
Write-Host "[*] Iniciando compilacion de release: cargo tauri build --no-bundle ..." -ForegroundColor Cyan
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$buildSuccess = $false
try {
    & cargo tauri build --no-bundle
    if ($LASTEXITCODE -eq 0) {
        $buildSuccess = $true
    }
} catch {
    Write-Error "Fallo la ejecucion de cargo tauri build: $_"
    exit 1
}

if (-not $buildSuccess) {
    Write-Error "La compilacion cargo tauri build finalizo con codigo de error."
    exit 1
}

# 8. Locate generated EXE
$candidateExe = "$projectRoot\src-tauri\target\release\tron-explorer.exe"
if (-not (Test-Path $candidateExe)) {
    $candidateExe = "$projectRoot\src-tauri\target\release\tronExplorer.exe"
}

if (-not (Test-Path $candidateExe)) {
    Write-Error "No se encontro el binario compilado en src-tauri\target\release"
    exit 1
}

# 9. Safely copy to tronExplorer-Portable.exe at root
$destExe = "$projectRoot\tronExplorer-Portable.exe"
Get-Process | Where-Object { $_.ProcessName -like "*tronExplorer*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Copy-Item -Path $candidateExe -Destination $destExe -Force

# 10. Verify and Display Information
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  COMPILACION COMPLETADA CON EXITO        " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

$item = Get-Item $destExe
$sizeMb = [math]::Round($item.Length / 1MB, 2)
$peHeader = [System.IO.File]::ReadAllBytes($destExe)
$is64Bit = $false
if ($peHeader.Length -gt 256) {
    $peOffset = [System.BitConverter]::ToInt32($peHeader, 60)
    $machine = [System.BitConverter]::ToUInt16($peHeader, $peOffset + 4)
    if ($machine -eq 0x8664) {
        $is64Bit = $true
    }
}

Write-Host "Ruta ejecutable: $($item.FullName)" -ForegroundColor White
Write-Host "Tamano:          $($item.Length) bytes ($sizeMb MB)" -ForegroundColor White
Write-Host "Fecha:           $($item.LastWriteTime)" -ForegroundColor White
Write-Host "Arquitectura:    $(if ($is64Bit) {'PE Windows x64'} else {'x86 o desconegut'})" -ForegroundColor White
Write-Host "Listo para ejecutar directamente." -ForegroundColor Cyan
