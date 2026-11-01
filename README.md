# Interactive Poll — quiz de fête façon Kahoot

🇫🇷 Français · [🇬🇧 English](README.en.md)

Un quiz interactif qui tourne **en local** : la télé affiche les slides, les invités jouent depuis leur téléphone, et l'animateur pilote depuis le sien. Pas de compte, pas d'Internet nécessaire.

Types de slides : contenu, quiz, slider (valeur numérique), avis du public, nuage de mots, jeu du demi-cercle. Les questions s'écrivent dans un simple fichier [slides.yaml](slides.yaml).

> ## ⚠️ À lire avant de l'utiliser
>
> - **Ce projet a été entièrement « vibe-codé » avec Claude Opus** (Anthropic). Le code n'a pas fait l'objet d'une relecture ou d'un audit sérieux.
> - **Il n'y a aucune sécurité** : pas de mot de passe, pas d'authentification, pas de chiffrement (HTTP simple). La page `/admin` est ouverte à **toute personne qui peut joindre le serveur** : elle peut avancer les slides, effacer les scores, etc.
> - **Faites-le tourner de préférence sur un Wi-Fi local de confiance** (box ou point d'accès perso, avec des gens que vous connaissez). **Ne l'exposez jamais sur Internet** (pas de redirection de port, pas de tunnel public).
> - Le logiciel est fourni « tel quel », sans aucune garantie (voir la licence).

## Sommaire

- [Installation sur Ubuntu / Linux](#installation-sur-ubuntu--linux)
- [Installation sur Windows](#installation-sur-windows)
- [Lancer la partie](#lancer-la-partie)
- [Si les téléphones n'arrivent pas à se connecter](#si-les-téléphones-narrivent-pas-à-se-connecter)
- [Préparer ses slides](#préparer-ses-slides)
- [Pendant la partie (admin)](#pendant-la-partie-admin)
- [Bon à savoir](#bon-à-savoir)
- [Licence](#licence)

## Installation sur Ubuntu / Linux

### Méthode rapide : le script d'installation

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/will-44/interactive_poll.git
cd interactive_poll
./install-ubuntu.sh
```

Le script installe Node.js 22 LTS s'il manque, lance `npm install`, ouvre le port 3000 dans `ufw` **uniquement pour les réseaux locaux** (si `ufw` est actif) et crée un lanceur « Interactive Poll » dans le menu des applications. Ensuite, pour jouer : `./start-ubuntu.sh` (ou le lanceur).

### Méthode manuelle

Il faut **Node.js 18 ou plus récent** (Node 20 ou 22 LTS recommandé) et git.

```bash
# 1. git
sudo apt update
sudo apt install -y git curl

# 2. Node.js 22 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # doit afficher v18 ou plus

# 3. Le projet
git clone https://github.com/will-44/interactive_poll.git
cd interactive_poll
npm install

# 4. Lancer
npm start
```

> Si vous préférez ne pas utiliser `sudo`, installez Node avec [nvm](https://github.com/nvm-sh/nvm) : `nvm install --lts`.

Pare-feu (s'il est actif, ce qui n'est pas le cas par défaut sur Ubuntu) :

```bash
sudo ufw allow 3000/tcp
```

## Installation sur Windows

### Méthode 1 : l'installeur `.exe` (le plus simple)

1. Téléchargez `InteractivePoll-Setup-x.y.z.exe` depuis la page [Releases](https://github.com/will-44/interactive_poll/releases) du dépôt.
2. Double-cliquez dessus. Rien à installer avant : Node.js est embarqué. L'installeur configure aussi le pare-feu Windows pour les **réseaux privés**.
3. Lancez **Interactive Poll** depuis le menu Démarrer (ou le bureau).

Windows affichera un avertissement SmartScreen (« Windows a protégé votre PC »), car l'installeur n'est pas signé : cliquez sur **Informations complémentaires** puis **Exécuter quand même**. Les slides se modifient via le menu Démarrer → *Modifier les slides*. Une mise à jour conserve vos slides et vos images. Si votre Wi-Fi est classé « Public » par Windows, passez-le en « Privé » (Paramètres → Réseau et Internet → Wi-Fi → propriétés du réseau), sinon le pare-feu bloquera les téléphones.

### Méthode 2 : le script d'installation

1. Téléchargez le projet : [ZIP](https://github.com/will-44/interactive_poll/archive/refs/heads/main.zip) à décompresser, ou `git clone`.
2. Double-cliquez sur **`install-windows.bat`** et acceptez la demande d'autorisation (administrateur).

Le script installe Node.js LTS s'il manque (winget, sinon l'installeur officiel), lance `npm install`, autorise Node.js dans le pare-feu pour les réseaux privés, propose de passer le Wi-Fi en « Privé » s'il est en « Public », et crée un raccourci **Interactive Poll** sur le bureau (il lance `start-windows.bat`).

### Méthode 3 : manuelle

1. Installez **Node.js LTS** depuis <https://nodejs.org> (installeur `.msi`, laissez les options par défaut).
2. Installez **Git** depuis <https://git-scm.com/download/win> (ou téléchargez le projet en ZIP depuis GitHub : bouton *Code* → *Download ZIP*, puis décompressez-le).
3. Ouvrez **PowerShell** (ou le Terminal Windows) et tapez :

```powershell
node -v    # doit afficher v18 ou plus

git clone https://github.com/will-44/interactive_poll.git
cd interactive_poll
npm install
npm start
```

Au premier lancement, **Windows affiche une alerte du pare-feu** pour Node.js : cochez **« Réseaux privés »** puis *Autoriser l'accès*. Sans cela, les téléphones ne pourront pas se connecter.

> Si PowerShell refuse `npm` avec une erreur de « stratégie d'exécution », utilisez `cmd` à la place, ou lancez une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Pour changer une variable d'environnement sous Windows :

```powershell
$env:PORT = 8080; npm start
$env:HOST_IP = "192.168.1.42"; npm start
```

## Lancer la partie

```bash
npm start
```

La première fois, cette commande compile l'interface (quelques secondes), puis lance le serveur. La console affiche trois adresses :

| Page | Pour qui | Adresse |
| --- | --- | --- |
| Invités | les téléphones (QR code sur la télé) | `http://<ip>:3000` |
| Télé | le navigateur branché sur la télé (plein écran : F11) | `http://<ip>:3000/tv` |
| Admin | le téléphone de l'animateur | `http://<ip>:3000/admin` |

Tout le monde doit être sur le **même Wi-Fi** que l'ordinateur. Internet n'est pas nécessaire (les polices sont embarquées).

> **Important :** l'adresse du QR code est calculée au lancement. Connectez d'abord l'ordinateur au Wi-Fi, **puis** lancez `npm start`. Si vous changez de réseau, relancez-le (la partie en cours est conservée).

## Si les téléphones n'arrivent pas à se connecter

- **Mauvaise IP dans le QR code** : la console liste les autres adresses détectées. Relancez avec la bonne :
  - Linux : `HOST_IP=192.168.1.42 npm start`
  - Windows (PowerShell) : `$env:HOST_IP = "192.168.1.42"; npm start`
- **Pare-feu** : voir les sections d'installation (ufw sur Linux, « Réseaux privés » sur Windows).
- **Wi-Fi « invités » / isolation des clients** : certaines box empêchent les appareils de se voir entre eux. Utilisez le Wi-Fi principal, ou créez un point d'accès depuis l'ordinateur ou un téléphone.
- **Autre port** : `PORT=8080 npm start` (Linux) ou `$env:PORT = 8080; npm start` (Windows).

## Préparer ses slides

Tout se passe dans [slides.yaml](slides.yaml) (le fichier est commenté) et le dossier [images/](images/). Le fichier fourni est un **exemple fictif** : remplacez-le par vos questions.

Pendant la partie, après une modification : bouton **Recharger le YAML** dans l'admin. En cas d'erreur (option manquante, image introuvable…), l'admin l'affiche et garde l'ancienne version.

Astuce : pour garder vos vraies slides hors de git, mettez-les dans `slides.perso.yaml` et vos photos dans `images/perso/` (déjà ignorés par `.gitignore`), puis lancez `SLIDES=slides.perso.yaml npm start` (Windows : `$env:SLIDES = "slides.perso.yaml"; npm start`).

```yaml
titre: "Les 30 ans d'Alex !"
podium_texte: "Thank you for the music !"   # facultatif : phrase sous « Le podium » ("" = aucune)
background: images/fond-mer.svg             # fond par défaut

slides:
  - type: contenu
    titre: "Bienvenue !"
    texte: "Sortez vos téléphones."
    cadre: { image: images/exemple-photo.svg }

  - type: quiz
    question: "Dans quelle ville Alex est-il/elle né(e) ?"
    options: [Lyon, Marseille, Nantes, Lille]
    answer: Nantes                   # facultatif
    melanger: non                    # facultatif : par défaut les options sont mélangées

  - type: slider
    question: "Combien de pays Alex a-t-il/elle visités ?"
    min: 0
    max: 50
    unite: pays
    tolerance: 5                     # 0 pt au-delà de ±5
    background: images/fond-disco.svg
    cadre: { texte: "Indice : beaucoup." }

  - type: avis                       # avis du public (pas de points)
    question: "Alex est plutôt…"
    gauche: "Lève-tôt"               # facultatif
    droite: "Couche-tard"            # facultatif ; échelle 0–10 par défaut (min, max, step, unite)

  - type: wordcloud
    question: "Décris Alex en un mot"
    max_mots: 3                      # un mot à la fois, avec une jauge ; ou « illimité »

  - type: demicercle                 # jeu du demi-cercle (pas de points)
    gauche: "Ringard"
    droite: "Stylé"
    cible: 70                        # facultatif : 0 = gauche, 100 = droite, sinon au hasard
```

**Avis du public :** chaque invité bouge un curseur sur son téléphone ; sur la télé, le curseur glisse en direct vers la moyenne des réponses.

**Jeu du demi-cercle :** les invités voient la cible sur leur téléphone et écrivent un mot, qui s'affiche en nuage sur la télé (sans la cible). La personne fêtée montre sur la télé où elle pense que la cible se trouve. Dans l'admin, le premier « Suivante » révèle la cible, le second passe à la slide suivante.

Fonds fournis : `fond-mer.svg`, `fond-disco.svg`, `fond-chaux.svg`. Vous pouvez mettre vos propres jpg/png dans `images/` (idéalement en 16:9).

> Les photos d'iPhone sont souvent en **HEIC**, que le navigateur n'affiche pas : convertissez-les en JPG avant de les mettre dans `images/`.
>
> N'utilisez que des images dont vous avez les droits si vous publiez votre dépôt.

## Pendant la partie (admin)

- **Commencer / Suivante / Précédente** : navigation. Revenir en arrière réaffiche la slide sans faire revoter ni recompter.
- **Fermer les votes**, puis **Révéler**. Sans `answer` dans le YAML, vous choisissez la bonne option (quiz) ou saisissez la valeur (slider) avant de révéler.
- Quitter une question sans fermer les votes les ferme. Vous pouvez y revenir pour révéler.
- **Points** : 1000 pour une bonne réponse au quiz ; au slider, de 1000 (valeur exacte) à 0 (au-delà de la tolérance). Le podium s'affiche après la dernière slide.
- **Croix à côté d'un joueur** : le retire de la partie.
- **Réinitialiser** : efface joueurs et scores (pratique après une répétition). Les téléphones déjà connectés se réinscrivent tout seuls.

## Bon à savoir

- Les scripts `install-windows.*` et `install-ubuntu.sh` sont de simples fichiers texte : relisez-les avant de les lancer, ils demandent les droits administrateur.
- L'interface est **en français** uniquement.
- Un invité qui recharge la page ou dont le téléphone se met en veille retrouve sa place et son score.
- L'état de la partie est sauvegardé en continu dans `data/state.json` : si l'ordinateur plante, relancez `npm start` et la partie reprend où elle en était. Pour repartir de zéro sans l'admin : supprimez ce fichier.
- Développement : `npm run dev` (rechargement à chaud sur le port 5173, le serveur temps réel reste sur 3000).

## Publier l'installeur Windows (mainteneur)

Le `.exe` est construit par GitHub Actions ([release-windows.yml](.github/workflows/release-windows.yml), script Inno Setup dans [installer/](installer/)). Il est testé automatiquement (installation silencieuse, puis le serveur doit répondre). Pour publier une version :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Le fichier `InteractivePoll-Setup-1.0.0.exe` apparaît alors dans les Releases. Le workflow peut aussi être lancé à la main depuis l'onglet *Actions*.

## Licence

Distribué sous licence **GNU GPL v3** : voir le fichier [LICENSE](LICENSE). Aucune garantie.
