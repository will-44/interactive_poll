import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { createEditorRouter, localOnly } from './editor-api.js';
import { Game } from './game.js';
import { lanAddresses, pickHostIp } from './network.js';
import { StoreError, createStore, isSlug } from './quizzes.js';
import { openBrowser } from './open-browser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 3000);
const NO_BROWSER = process.env.NO_BROWSER === '1' || process.argv.includes('--no-browser');

const joinUrl = `http://${pickHostIp()}:${PORT}`;
const qr = await QRCode.toString(joinUrl, {
  type: 'svg',
  margin: 1,
  color: { dark: '#0B2E52', light: '#FFFFFF' },
});

const STATE_FILE = process.env.STATE_FILE ?? path.join(ROOT, 'data', 'state.json');
const ACTIVE_FILE = path.join(path.dirname(STATE_FILE), 'active.json');
const game = new Game(STATE_FILE);
const store = createStore(ROOT);

// --- quiz actif ------------------------------------------------------------

function readActive() {
  try {
    const { slug } = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    if (isSlug(slug) && store.slugs().includes(slug)) return slug;
  } catch {
    // pas encore de choix enregistré
  }
  return null;
}

function writeActive(slug) {
  fs.mkdirSync(path.dirname(ACTIVE_FILE), { recursive: true });
  const tmp = `${ACTIVE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ slug }));
  fs.renameSync(tmp, ACTIVE_FILE);
}

// Un ancien slides.yaml à la racine devient un quiz de quizzes/.
const migrated = store.migrateLegacy();
if (migrated) {
  console.log(`\nℹ  Ton ancien slides.yaml a été repris dans quizzes/${migrated}.yaml (l'original est renommé slides.yaml.importe).`);
}

let activeSlug = migrated ?? readActive() ?? (store.slugs().includes('exemple') ? 'exemple' : store.slugs()[0]);
if (!activeSlug) activeSlug = store.create({ titre: 'Mon quiz' });
writeActive(activeSlug);

function activeInfo() {
  const doc = game.deck?.titre;
  return { slug: activeSlug, titre: doc ?? activeSlug };
}

// Relit le quiz actif sans toucher à la partie. En cas d'erreur, l'ancienne version reste jouée.
function reloadSlides() {
  const { deck, errors } = store.load(activeSlug);
  if (deck) game.setDeck(deck);
  else game.errors = errors;
  return errors;
}

const startErrors = reloadSlides();
if (startErrors.length) {
  console.error(`\n⚠  Le quiz « ${activeSlug} » contient des erreurs :`);
  for (const e of startErrors) console.error('   - ' + e);
}

// --- HTTP ------------------------------------------------------------------

const app = express();
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use(
  '/api',
  createEditorRouter({
    rootDir: ROOT,
    store,
    active: () => activeSlug,
    // Enregistrement du quiz en cours de jeu : on recharge les slides, la partie continue.
    saved: () => reloadSlides().length === 0 && (broadcast(), true),
    // « Lancer ce quiz » : nouvelle partie (joueurs et scores effacés) sur ce quiz.
    launch: (slug) => {
      const { deck, errors } = store.load(slug);
      if (!deck) throw new StoreError(422, 'Ce quiz contient des erreurs : impossible de le lancer', { errors });
      game.reset();
      game.setDeck(deck);
      activeSlug = slug;
      writeActive(slug);
      io.emit('rejoin');
      broadcast();
      return { ok: true };
    },
    reset: () => {
      game.reset();
      io.emit('rejoin');
      broadcast();
    },
    stop: () => shutdown(),
  }),
);
app.use(express.static(DIST, { index: false }));
app.get('/editor', localOnly, sendIndex);
app.get(['/', '/tv', '/admin'], sendIndex);
function sendIndex(req, res) {
  const index = path.join(DIST, 'index.html');
  if (!fs.existsSync(index)) {
    res.status(503).send('Interface non compilée : lance « npm start » (ou « npm run build »).');
    return;
  }
  res.sendFile(index);
}

const server = http.createServer(app);
const io = new Server(server);

// --- Temps réel ------------------------------------------------------------

const stateExtra = () => ({ joinUrl, qr, quiz: activeInfo() });

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    io.emit('state', game.snapshot(stateExtra()));
  }, 30);
}

io.on('connection', (socket) => {
  socket.emit('state', game.snapshot(stateExtra()));

  socket.on('player:join', (payload, ack) => {
    const res = game.join(payload?.id, payload?.name);
    if (res.player) {
      socket.data.playerId = res.player.id;
      socket.join('p:' + res.player.id);
      broadcast();
    }
    if (typeof ack === 'function') ack(res);
  });

  socket.on('player:answer', (value, ack) => {
    const error = game.answer(socket.data.playerId, value);
    broadcast();
    if (typeof ack === 'function') ack(error ? { error } : { ok: true });
  });

  const admin = (event, fn) =>
    socket.on(event, (arg, ack) => {
      const result = fn(arg);
      broadcast();
      if (typeof ack === 'function') ack(result ?? null);
    });

  admin('admin:next', () => game.go(1));
  admin('admin:prev', () => game.go(-1));
  admin('admin:close', () => game.close());
  admin('admin:correct', (value) => game.setCorrect(value));
  admin('admin:reveal', () => game.reveal());
  admin('admin:reload', () => ({ errors: reloadSlides() }));
  admin('admin:kick', (id) => {
    game.kick(id);
    io.to('p:' + id).emit('kicked');
    io.in('p:' + id).socketsLeave('p:' + id);
  });
  admin('admin:reset', () => {
    game.reset();
    io.emit('rejoin');
  });
});

function shutdown() {
  game.saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎤  Interactive Poll est lancé\n');
  console.log(`   Invités (QR sur la télé) : ${joinUrl}`);
  console.log(`   Télé                     : ${joinUrl}/tv`);
  console.log(`   Admin                    : ${joinUrl}/admin`);
  console.log(`   Éditeur de quiz          : http://localhost:${PORT}/editor   (cet ordinateur uniquement)`);
  const others = lanAddresses().filter((a) => !joinUrl.includes(a.address));
  if (others.length) {
    console.log('\n   Autres adresses détectées (si le QR ne marche pas, relance avec HOST_IP=… npm start) :');
    for (const a of others) console.log(`     ${a.name.padEnd(12)} http://${a.address}:${PORT}${a.virtual ? '  (virtuelle)' : ''}`);
  }
  console.log('');
  if (!NO_BROWSER) openBrowser(`http://localhost:${PORT}/editor`);
});
