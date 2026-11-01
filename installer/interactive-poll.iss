; Interactive Poll - installeur Windows (Inno Setup 6.3+).
;
; Construit automatiquement par .github/workflows/release-windows.yml : le workflow prépare
; un dossier "stage" (Node.js portable + serveur + interface compilée + dépendances de
; production), puis appelle :   ISCC.exe /DAppVersion=1.0.0 installer\interactive-poll.iss
;
; Rien à installer au préalable : Node.js est embarqué. L'installeur demande les droits
; administrateur uniquement pour créer la règle de pare-feu (réseaux privés).

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

[Setup]
AppId={{B7C0D6A2-4F1E-4C58-9A53-6E2A1D0F7B31}
AppName=Interactive Poll
AppVersion={#AppVersion}
AppPublisher=will-44
AppPublisherURL=https://github.com/will-44/interactive_poll
DefaultDirName={autopf}\Interactive Poll
DefaultGroupName=Interactive Poll
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\release
OutputBaseFilename=InteractivePoll-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
InfoBeforeFile=avertissement.txt
UninstallDisplayName=Interactive Poll
DisableProgramGroupPage=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
french.DesktopIcon=Créer un raccourci sur le bureau
english.DesktopIcon=Create a desktop shortcut
french.FirewallStatus=Configuration du pare-feu Windows (réseaux privés)...
english.FirewallStatus=Configuring Windows Firewall (private networks)...
french.EditSlides=Modifier les slides (slides.yaml)
english.EditSlides=Edit the slides (slides.yaml)
french.ImagesFolder=Dossier des images
english.ImagesFolder=Images folder
french.LaunchNow=Lancer Interactive Poll
english.LaunchNow=Start Interactive Poll

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"

[Dirs]
; L'utilisateur doit pouvoir modifier slides.yaml, ajouter des images et écrire l'état de la partie.
Name: "{app}"; Permissions: users-modify
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\images"; Permissions: users-modify

[Files]
Source: "..\stage\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs
Source: "..\stage\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs
Source: "..\stage\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs
Source: "..\stage\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs
Source: "..\stage\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\stage\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\stage\Interactive-Poll.bat"; DestDir: "{app}"; Flags: ignoreversion
; Les slides et images de l'utilisateur ne sont jamais écrasées lors d'une mise à jour.
Source: "..\stage\slides.yaml"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "..\stage\images\*"; DestDir: "{app}\images"; Flags: onlyifdoesntexist recursesubdirs uninsneveruninstall

[Icons]
Name: "{group}\Interactive Poll"; Filename: "{app}\Interactive-Poll.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:EditSlides}"; Filename: "{win}\notepad.exe"; Parameters: """{app}\slides.yaml"""
Name: "{group}\{cm:ImagesFolder}"; Filename: "{app}\images"
Name: "{autodesktop}\Interactive Poll"; Filename: "{app}\Interactive-Poll.bat"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Règle de pare-feu : le programme node.exe embarqué, réseaux privés uniquement.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Interactive Poll"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Interactive Poll"" dir=in action=allow program=""{app}\node\node.exe"" protocol=TCP profile=private enable=yes"; Flags: runhidden; StatusMsg: "{cm:FirewallStatus}"
Filename: "{app}\Interactive-Poll.bat"; WorkingDir: "{app}"; Description: "{cm:LaunchNow}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Interactive Poll"""; Flags: runhidden; RunOnceId: "DelFirewallRule"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
