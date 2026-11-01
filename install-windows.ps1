# Interactive Poll - installation sous Windows.
#
# Ce que fait ce script :
#   1. se relance en administrateur (necessaire pour le pare-feu et l'installation de Node.js)
#   2. installe Node.js LTS s'il est absent ou trop ancien (winget, sinon l'installeur .msi officiel)
#   3. lance "npm install"
#   4. autorise Node.js dans le pare-feu Windows, pour les reseaux PRIVES uniquement
#   5. propose de passer le reseau Wi-Fi en "Prive" s'il est en "Public"
#   6. cree un raccourci "Interactive Poll" sur le bureau
#
# Pour annuler la regle de pare-feu :  Remove-NetFirewallRule -DisplayName 'Interactive Poll'
# Ce fichier est volontairement sans accents : PowerShell 5.1 lit mal l'UTF-8 sans BOM.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ruleName = 'Interactive Poll'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Les droits administrateur sont necessaires (pare-feu, installation de Node.js).'
    Write-Host 'Une fenetre Windows va te demander l''autorisation...'
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
        )
    } catch {
        Write-Host 'Autorisation refusee : installation annulee.' -ForegroundColor Red
        Read-Host 'Appuie sur Entree pour fermer' | Out-Null
        exit 1
    }
    exit 0
}

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Get-NodeMajor {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 0 }
    $version = & $node.Source -v
    if ($version -match '^v(\d+)\.') { return [int]$Matches[1] }
    return 0
}

function Step([string]$text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Step '1/5  Node.js'
    if ((Get-NodeMajor) -ge 18) {
        Write-Host "Node.js deja installe ($(& node -v))."
    } else {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Host 'Installation de Node.js LTS avec winget...'
            winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
            Update-SessionPath
        }
        if ((Get-NodeMajor) -lt 18) {
            Write-Host 'Telechargement de l''installeur Node.js depuis nodejs.org...'
            $versions = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
            $lts = $versions | Where-Object { $_.lts } | Select-Object -First 1
            $msi = Join-Path $env:TEMP "node-$($lts.version)-x64.msi"
            Invoke-WebRequest -Uri "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-x64.msi" -OutFile $msi
            Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$msi`"", '/qn', '/norestart' -Wait
            Update-SessionPath
        }
        if ((Get-NodeMajor) -lt 18) {
            throw 'Impossible d''installer Node.js automatiquement. Installe-le depuis https://nodejs.org puis relance ce script.'
        }
        Write-Host "Node.js installe ($(& node -v))."
    }

    Step '2/5  Dependances du projet (npm install)'
    Push-Location $root
    try {
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install a echoue.' }
    } finally {
        Pop-Location
    }

    Step '3/5  Pare-feu Windows'
    $nodeExe = (Get-Command node).Source
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Program $nodeExe -Protocol TCP -Profile Private | Out-Null
    Write-Host "Node.js autorise en entree sur les reseaux prives ($nodeExe)."

    Step '4/5  Type de reseau'
    $publicNetworks = Get-NetConnectionProfile |
        Where-Object { $_.NetworkCategory -eq 'Public' -and $_.IPv4Connectivity -ne 'Disconnected' }
    if (-not $publicNetworks) {
        Write-Host 'Aucun reseau "Public" actif : rien a faire.'
    }
    foreach ($network in $publicNetworks) {
        Write-Host "Le reseau '$($network.Name)' est de type Public : le pare-feu y bloquera les telephones."
        $answer = Read-Host 'Le passer en Prive ? Fais-le seulement si c''est ton reseau de confiance (o/N)'
        if ($answer -match '^[oOyY]') {
            Set-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex -NetworkCategory Private
            Write-Host 'Reseau passe en Prive.'
        }
    }

    Step '5/5  Raccourci sur le bureau'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Interactive Poll.lnk'))
    $shortcut.TargetPath = Join-Path $root 'start-windows.bat'
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = 'Lance le quiz Interactive Poll'
    $shortcut.Save()

    Write-Host ''
    Write-Host 'Installation terminee !' -ForegroundColor Green
    Write-Host 'Lance le quiz avec le raccourci "Interactive Poll" du bureau (ou start-windows.bat).'
    Write-Host 'Rappel : aucune securite, a utiliser sur un Wi-Fi local de confiance.'
} catch {
    Write-Host ''
    Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Appuie sur Entree pour fermer' | Out-Null
    exit 1
}

Read-Host 'Appuie sur Entree pour fermer' | Out-Null
