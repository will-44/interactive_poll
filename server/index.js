import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { lanAddresses, pickHostIp } from './network.js';
import { loadSlides } from './slides.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const joinUrl = `http://${pickHostIp()}:${PORT}`;
const qr = await QRCode.toString(joinUrl, {
  type: 'svg',
  margin: 1,
  color: { dark: '#0B2E52', light: '#FFFFFF' },
});

const SLIDES = process.env.SLIDES ?? 'slides.yaml';
const game = new Game(process.env.STATE_FILE ?? path.join(ROOT, 'data', 'state.json'));

function reloadSlides() {
  const { deck, errors } = loadSlides(ROOT, SLIDES);
  if (deck) game.setDeck(deck);
  else game.errors = errors;
  return errors;
}

const startErrors = reloadSlides();
if (startErrors.length) {
  console.error('\n⚠  slides.yaml contient des erreurs :');
  for (const e of startErrors) console.error('   - ' + e);
}

// --- HTTP ------------------------------------------------------------------

const app = express();
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use(express.static(DIST, { index: false }));
app.get(['/', '/tv', '/admin'], (req, res) => {
  const index = path.join(DIST, 'index.html');
  if (!fs.existsSync(index)) {
    res.status(503).send('Interface non compilée : lance « npm start » (ou « npm run build »).');
    return;
  }
  res.sendFile(index);
});

const server = http.createServer(app);
const io = new Server(server);

// --- Temps réel ------------------------------------------------------------

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    io.emit('state', game.snapshot({ joinUrl, qr }));
  }, 30);
}

io.on('connection', (socket) => {
  socket.emit('state', game.snapshot({ joinUrl, qr }));

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
  const others = lanAddresses().filter((a) => !joinUrl.includes(a.address));
  if (others.length) {
    console.log('\n   Autres adresses détectées (si le QR ne marche pas, relance avec HOST_IP=… npm start) :');
    for (const a of others) console.log(`     ${a.name.padEnd(12)} http://${a.address}:${PORT}${a.virtual ? '  (virtuelle)' : ''}`);
  }
  console.log('');
});
