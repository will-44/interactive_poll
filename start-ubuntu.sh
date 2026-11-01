#!/usr/bin/env bash
# Interactive Poll - lance le quiz.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
npm start
status=$?
echo
read -r -p "Le serveur s'est arrêté. Appuie sur Entrée pour fermer." _
exit $status
