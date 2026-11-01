import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { StoreError, isSlug, normalizeDoc } from './quizzes.js';
import { parseDoc } from './slides.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_IMAGE = 15 * 1024 * 1024;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

// L'éditeur écrit sur le disque et arrête l'appli : il ne répond qu'à l'ordinateur qui fait tourner le serveur.
// - adresse de l'appelant : empêche les téléphones du Wi-Fi d'y accéder ;
// - en-tête Host : empêche le « DNS rebinding » (une page web qui se ferait passer pour localhost) ;
// - en-tête X-Requested-With sur les écritures : empêche un site ouvert dans le navigateur d'envoyer un formulaire à l'éditeur.
export function localOnly(req, res, next) {
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  const local = LOOPBACK.has(req.socket.remoteAddress) && LOCAL_HOSTS.has(host);
  if (!local) {
    res.status(403).type('text/plain; charset=utf-8').send("L'éditeur n'est accessible que depuis l'ordinateur qui fait tourner l'application (http://localhost).");
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-requested-with'] !== 'interactive-poll') {
    res.status(403).type('text/plain; charset=utf-8').send('Requête refusée.');
    return;
  }
  next();
}

// Détecte le vrai format d'après les premiers octets (l'extension du fichier ne prouve rien).
function sniffImage(buf) {
  const head = (...bytes) => bytes.every((b, i) => buf[i] === b);
  if (head(0xff, 0xd8, 0xff)) return 'jpg';
  if (head(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(buf.subarray(8, 12).toString('latin1'))) return 'heic';
  const text = buf.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml|<!--|<!DOCTYPE svg|<svg)/i.test(text) && /<svg[\s>]/i.test(buf.toString('utf8'))) return 'svg';
  return null;
}

function safeBaseName(name) {
  const base = path.basename(String(name ?? '')).replace(/\.[^.]*$/, '');
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return clean || 'photo';
}

function fail(status, message, extra) {
  return new StoreError(status, message, extra);
}

/**
 * ctx : { rootDir, store, active(), launch(slug), saved(slug), reset(), stop() }
 * Les actions qui touchent à la partie en cours sont fournies par index.js.
 */
export function createEditorRouter(ctx) {
  const { rootDir, store } = ctx;
  const imagesDir = path.join(rootDir, 'images');
  const router = express.Router();
  router.use(localOnly);
  router.use(express.json({ limit: '2mb' }));

  const wrap = (fn) => (req, res, next) => {
    try {
      Promise.resolve(fn(req, res)).catch(next);
    } catch (e) {
      next(e);
    }
  };

  const slugParam = (req) => {
    if (!isSlug(req.params.slug)) throw fail(400, 'Nom de quiz invalide');
    return req.params.slug;
  };

  router.get('/quizzes', wrap((req, res) => res.json({ quizzes: store.list(), active: ctx.active() })));

  router.post('/quizzes', wrap((req, res) => {
    const slug = store.create({ titre: req.body?.titre, from: req.body?.from });
    res.json({ slug });
  }));

  router.get('/quizzes/:slug', wrap((req, res) => {
    res.json({ ...store.read(slugParam(req)), active: ctx.active() === req.params.slug });
  }));

  router.put('/quizzes/:slug', wrap((req, res) => {
    const slug = slugParam(req);
    const doc = store.save(slug, req.body?.doc);
    const applied = ctx.active() === slug ? ctx.saved(slug) : false;
    res.json({ ok: true, doc, applied });
  }));

  router.delete('/quizzes/:slug', wrap((req, res) => {
    const slug = slugParam(req);
    if (ctx.active() === slug) throw fail(409, 'Ce quiz est en cours de jeu : lance un autre quiz avant de le supprimer.');
    store.remove(slug);
    res.json({ ok: true });
  }));

  router.post('/quizzes/:slug/launch', wrap((req, res) => {
    res.json(ctx.launch(slugParam(req)));
  }));

  router.get('/quizzes/:slug/export', wrap((req, res) => {
    const slug = slugParam(req);
    res.set('Content-Disposition', `attachment; filename="${slug}.yaml"`);
    res.type('text/yaml; charset=utf-8').send(store.exportText(slug));
  }));

  // Vérification en direct (sans rien écrire) : mêmes messages que ceux du serveur au démarrage.
  router.post('/validate', wrap((req, res) => {
    let errors;
    try {
      errors = parseDoc(rootDir, normalizeDoc(req.body?.doc)).errors;
    } catch (e) {
      if (!(e instanceof StoreError)) throw e;
      errors = [e.message];
    }
    res.json({ errors });
  }));

  router.post('/import', express.text({ type: '*/*', limit: '2mb' }), wrap((req, res) => {
    if (typeof req.body !== 'string' || !req.body.trim()) throw fail(400, 'Fichier vide');
    res.json(store.importText(req.body));
  }));

  // --- photos ---------------------------------------------------------------

  router.get('/images', wrap((req, res) => {
    const names = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
    const images = names
      .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()) && fs.statSync(path.join(imagesDir, n)).isFile())
      .sort((a, b) => a.localeCompare(b))
      .map((n) => `images/${n}`);
    res.json({ images });
  }));

  // Le fichier arrive tel quel dans le corps de la requête ; son nom d'origine est dans ?name=
  router.post('/images', express.raw({ type: '*/*', limit: MAX_IMAGE }), wrap((req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw fail(400, 'Fichier vide');
    const kind = sniffImage(buf);
    if (kind === 'heic') throw fail(415, "Les photos HEIC (iPhone) ne sont pas lues par les navigateurs : exporte-la en JPG (ou règle l'iPhone sur « Le plus compatible »).");
    if (!kind) throw fail(415, 'Format non reconnu : utilise une image JPG, PNG, GIF, WebP ou SVG.');
    if (kind === 'svg' && /<script|\son[a-z]+\s*=|javascript:/i.test(buf.toString('utf8'))) {
      throw fail(415, 'Ce SVG contient du code (script) : il est refusé.');
    }
    const ext = kind === 'jpg' ? '.jpg' : `.${kind}`;
    const base = safeBaseName(req.query.name);
    fs.mkdirSync(imagesDir, { recursive: true });
    let name = `${base}${ext}`;
    for (let n = 2; fs.existsSync(path.join(imagesDir, name)); n++) name = `${base}-${n}${ext}`;
    fs.writeFileSync(path.join(imagesDir, name), buf, { flag: 'wx' });
    res.json({ image: `images/${name}` });
  }));

  // --- partie ---------------------------------------------------------------

  router.post('/reset', wrap((req, res) => {
    ctx.reset();
    res.json({ ok: true });
  }));

  router.post('/stop', wrap((req, res) => {
    res.json({ ok: true });
    res.on('finish', () => setTimeout(() => ctx.stop(), 100));
  }));

  router.use((req, res) => res.status(404).json({ error: 'Introuvable' }));

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof StoreError) {
      res.status(err.status).json({ error: err.message, ...err.extra });
    } else if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Fichier trop gros (15 Mo maximum).' });
    } else if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Requête illisible.' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Erreur inattendue (voir la console du serveur).' });
    }
  });

  return router;
}
