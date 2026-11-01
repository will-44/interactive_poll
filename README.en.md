# Interactive Poll — a Kahoot-style party quiz

[🇫🇷 Français](README.md) · 🇬🇧 English

An interactive quiz that runs **locally**: the TV shows the slides, guests play from their phones, and the host drives it from theirs. No accounts, no Internet required.

Slide types: content, quiz, slider (numeric guess), audience opinion, word cloud, and a "half-circle" guessing game. Questions are written in a plain file, [slides.yaml](slides.yaml).

> **Note:** the app's interface (buttons, labels) is in **French** only. The README is available in both languages.

> ## ⚠️ Read this first
>
> - **This project was entirely "vibe-coded" with Claude Opus** (Anthropic). The code has not been seriously reviewed or audited.
> - **There is no security whatsoever**: no password, no authentication, no encryption (plain HTTP). The `/admin` page is open to **anyone who can reach the server**: they can skip slides, wipe scores, etc.
> - **Run it on a trusted local Wi-Fi network** (your home router or a personal hotspot, with people you know). **Never expose it to the Internet** (no port forwarding, no public tunnel).
> - The software is provided "as is", with no warranty of any kind (see the license).

## Contents

- [Install on Ubuntu / Linux](#install-on-ubuntu--linux)
- [Install on Windows](#install-on-windows)
- [Start a game](#start-a-game)
- [If phones cannot connect](#if-phones-cannot-connect)
- [Write your own slides](#write-your-own-slides)
- [During the game (admin)](#during-the-game-admin)
- [Good to know](#good-to-know)
- [License](#license)

## Install on Ubuntu / Linux

You need **Node.js 18 or newer** (Node 20 or 22 LTS recommended) and git.

```bash
# 1. git
sudo apt update
sudo apt install -y git curl

# 2. Node.js 22 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # should print v18 or higher

# 3. The project
git clone https://github.com/will-44/interactive_poll.git
cd interactive_poll
npm install

# 4. Run
npm start
```

> If you would rather not use `sudo`, install Node with [nvm](https://github.com/nvm-sh/nvm): `nvm install --lts`.

Firewall (only if it is enabled, which is not the default on Ubuntu):

```bash
sudo ufw allow 3000/tcp
```

## Install on Windows

1. Install **Node.js LTS** from <https://nodejs.org> (`.msi` installer, keep the default options).
2. Install **Git** from <https://git-scm.com/download/win> (or download the project as a ZIP from GitHub: *Code* → *Download ZIP*, then unzip it).
3. Open **PowerShell** (or Windows Terminal) and run:

```powershell
node -v    # should print v18 or higher

git clone https://github.com/will-44/interactive_poll.git
cd interactive_poll
npm install
npm start
```

On first run, **Windows shows a firewall alert** for Node.js: tick **"Private networks"** and click *Allow access*. Without this, phones will not be able to connect.

> If PowerShell refuses `npm` with an "execution policy" error, use `cmd` instead, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Setting environment variables on Windows:

```powershell
$env:PORT = 8080; npm start
$env:HOST_IP = "192.168.1.42"; npm start
```

## Start a game

```bash
npm start
```

The first time, this builds the interface (a few seconds) and then starts the server. The console prints three addresses:

| Page | For whom | Address |
| --- | --- | --- |
| Guests | the phones (QR code on the TV) | `http://<ip>:3000` |
| TV | the browser connected to the TV (full screen: F11) | `http://<ip>:3000/tv` |
| Admin | the host's phone | `http://<ip>:3000/admin` |

Everyone must be on the **same Wi-Fi** as the computer. No Internet is needed (fonts are bundled).

> **Important:** the QR code address is computed at startup. Connect the computer to the Wi-Fi first, **then** run `npm start`. If you change network, restart it (the game in progress is kept).

## If phones cannot connect

- **Wrong IP in the QR code**: the console lists the other detected addresses. Restart with the right one:
  - Linux: `HOST_IP=192.168.1.42 npm start`
  - Windows (PowerShell): `$env:HOST_IP = "192.168.1.42"; npm start`
- **Firewall**: see the install sections (ufw on Linux, "Private networks" on Windows).
- **"Guest" Wi-Fi / client isolation**: some routers stop devices from seeing each other. Use the main Wi-Fi, or create a hotspot from the computer or a phone.
- **Different port**: `PORT=8080 npm start` (Linux) or `$env:PORT = 8080; npm start` (Windows).

## Write your own slides

Everything lives in [slides.yaml](slides.yaml) (the file is commented, in French) and the [images/](images/) folder. The bundled file is a **fictional example**: replace it with your own questions.

During a game, after editing: use the **Recharger le YAML** (reload YAML) button in the admin page. On error (missing option, image not found…), the admin shows it and keeps the previous version.

Tip: to keep your real slides out of git, put them in `slides.perso.yaml` and your photos in `images/perso/` (both already in `.gitignore`), then run `SLIDES=slides.perso.yaml npm start` (Windows: `$env:SLIDES = "slides.perso.yaml"; npm start`).

```yaml
titre: "Alex's 30th birthday!"
podium_texte: "Thank you for the music !"   # optional: line under "Le podium" ("" = none)
background: images/fond-mer.svg             # default background

slides:
  - type: contenu                    # content slide, no vote
    titre: "Welcome!"
    texte: "Get your phones out."
    cadre: { image: images/exemple-photo.svg }

  - type: quiz
    question: "Which city was Alex born in?"
    options: [Lyon, Marseille, Nantes, Lille]
    answer: Nantes                   # optional
    melanger: non                    # optional: options are shuffled by default

  - type: slider
    question: "How many countries has Alex visited?"
    min: 0
    max: 50
    unite: countries
    tolerance: 5                     # 0 points beyond ±5
    background: images/fond-disco.svg
    cadre: { texte: "Hint: a lot." }

  - type: avis                       # audience opinion (no points)
    question: "Alex is more of a…"
    gauche: "Early bird"             # optional
    droite: "Night owl"              # optional; scale 0–10 by default (min, max, step, unite)

  - type: wordcloud
    question: "Describe Alex in one word"
    max_mots: 3                      # one word at a time, with a gauge; or "illimité" (unlimited)

  - type: demicercle                 # half-circle game (no points)
    gauche: "Cheesy"
    droite: "Cool"
    cible: 70                        # optional: 0 = left, 100 = right, otherwise random
```

(The YAML keys are French: `titre`, `texte`, `cadre`, `gauche`, `droite`, `cible`, `melanger`… Keep them as they are.)

**Audience opinion:** each guest moves a slider on their phone; on the TV the cursor slides live towards the average.

**Half-circle game:** guests see the target on their phone and type a word, which appears as a word cloud on the TV (without the target). The guest of honour shows on the TV where they think the target is. In the admin page, the first "Suivante" (next) reveals the target, the second moves to the next slide.

Bundled backgrounds: `fond-mer.svg`, `fond-disco.svg`, `fond-chaux.svg`. You can drop your own jpg/png into `images/` (ideally 16:9).

> iPhone photos are often **HEIC**, which browsers cannot display: convert them to JPG before adding them to `images/`.
>
> Only use images you have the rights to if you publish your repository.

## During the game (admin)

- **Commencer / Suivante / Précédente** (start / next / previous): navigation. Going back shows the slide again without re-voting or re-counting.
- **Fermer les votes** (close votes), then **Révéler** (reveal). Without `answer` in the YAML, you pick the correct option (quiz) or type the value (slider) before revealing.
- Leaving a question without closing the votes closes them. You can come back to reveal.
- **Points**: 1000 for a correct quiz answer; for sliders, from 1000 (exact value) down to 0 (beyond the tolerance). The podium appears after the last slide.
- **Cross next to a player**: removes them from the game.
- **Réinitialiser** (reset): wipes players and scores (handy after a rehearsal). Phones already connected re-register on their own.

## Good to know

- A guest who reloads the page or whose phone goes to sleep gets their spot and score back.
- Game state is saved continuously in `data/state.json`: if the computer crashes, run `npm start` again and the game resumes where it was. To start from scratch without the admin page: delete that file.
- Development: `npm run dev` (hot reload on port 5173, the realtime server stays on 3000).

## License

Released under the **GNU GPL v3**: see [LICENSE](LICENSE). No warranty.
