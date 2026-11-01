#!/usr/bin/env bash
# Interactive Poll - installation sous Ubuntu / Debian.
#
#   1. installe Node.js 22 LTS (NodeSource) s'il est absent ou trop ancien
#   2. lance "npm install"
#   3. si le pare-feu ufw est actif : ouvre le port 3000 aux seuls reseaux locaux
#   4. cree un lanceur "Interactive Poll" dans le menu des applications
#
# Usage :  ./install-ubuntu.sh      (sans sudo : le script le demandera au besoin)
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
DIR="$PWD"
PORT="${PORT:-3000}"

if [ "$(id -u)" -eq 0 ]; then
  echo "Ne lance pas ce script avec sudo : il demandera le mot de passe quand il en aura besoin." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$1"; }

node_ok() {
  command -v node >/dev/null 2>&1 \
    && command -v npm >/dev/null 2>&1 \
    && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]
}

step "1/4  Node.js"
if node_ok; then
  echo "Node.js $(node -v) et npm $(npm -v) déjà installés."
else
  echo "Installation de Node.js 22 LTS (dépôt NodeSource)..."
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node_ok || { echo "Node.js n'a pas pu être installé." >&2; exit 1; }
  echo "Node.js $(node -v) installé."
fi

step "2/4  Dépendances du projet (npm install)"
npm install --no-audit --no-fund

step "3/4  Pare-feu"
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q '^Status: active'; then
  # Réseaux locaux uniquement (192.168.x.x, 10.x.x.x, 172.16-31.x.x), pas tout Internet.
  for net in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do
    sudo ufw allow from "$net" to any port "$PORT" proto tcp comment 'Interactive Poll'
  done
  echo "Port $PORT ouvert aux réseaux locaux."
else
  echo "ufw est inactif ou absent : rien à faire."
fi

step "4/4  Lanceur"
chmod +x "$DIR/start-ubuntu.sh"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
cat > "$APPS/interactive-poll.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Interactive Poll
Comment=Lance le quiz Interactive Poll
Exec="$DIR/start-ubuntu.sh"
Path=$DIR
Icon=applications-games
Terminal=true
Categories=Game;
EOF
echo "Lanceur créé : $APPS/interactive-poll.desktop (cherche « Interactive Poll » dans les applications)."

printf '\nInstallation terminée !\n'
echo "Lance le quiz avec :  ./start-ubuntu.sh   (ou depuis le menu des applications)"
echo "Rappel : aucune sécurité, à utiliser sur un Wi-Fi local de confiance."
