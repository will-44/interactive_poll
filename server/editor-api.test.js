import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { createEditorRouter, localOnly } from './editor-api.js';
import { createStore } from './quizzes.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-api-'));
fs.mkdirSync(path.join(root, 'images'));
const calls = [];
let server;
let base;

before(async () => {
  const store = createStore(root);
  const app = express();
  app.use('/api', createEditorRouter({ rootDir: root, store, active: () => 'actif', saved: () => true, launch: () => ({ ok: true }), reset: () => calls.push('reset'), stop: () => calls.push('stop') }));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const WRITE = { 'X-Requested-With': 'interactive-poll' };

function fakeReq({ remote = '127.0.0.1', host = 'localhost:3000', method = 'GET', headers = {} } = {}) {
  let out = null;
  const res = { status(c) { out = { code: c }; return this; }, type() { return this; }, send() {} };
  let passed = false;
  localOnly({ socket: { remoteAddress: remote }, headers: { host, ...headers }, method }, res, () => { passed = true; });
  return passed ? 'ok' : out.code;
}

test('localOnly : seul le poste local, avec un Host local', () => {
  assert.equal(fakeReq(), 'ok');
  assert.equal(fakeReq({ remote: '::1', host: '[::1]:3000' }), 'ok');
  assert.equal(fakeReq({ remote: '::ffff:127.0.0.1', host: '127.0.0.1' }), 'ok');
  assert.equal(fakeReq({ remote: '192.168.1.20' }), 403); // téléphone du Wi-Fi
  assert.equal(fakeReq({ host: 'evil.example.com' }), 403); // DNS rebinding
  assert.equal(fakeReq({ method: 'POST' }), 403); // pas d'en-tête personnalisé
  assert.equal(fakeReq({ method: 'POST', headers: { 'x-requested-with': 'interactive-poll' } }), 'ok');
});

test('API : écritures refusées sans en-tête, nom dangereux refusé', async () => {
  let res = await fetch(`${base}/reset`, { method: 'POST' });
  assert.equal(res.status, 403);
  assert.deepEqual(calls, []);
  res = await fetch(`${base}/reset`, { method: 'POST', headers: WRITE });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['reset']);
  res = await fetch(`${base}/quizzes/..%2F..%2Fpackage`);
  assert.equal(res.status, 400);
});

test('API : création, enregistrement invalide (422), suppression du quiz actif (409)', async () => {
  const json = { ...WRITE, 'Content-Type': 'application/json' };
  let res = await fetch(`${base}/quizzes`, { method: 'POST', headers: json, body: JSON.stringify({ titre: 'Essai' }) });
  assert.equal((await res.json()).slug, 'essai');
  res = await fetch(`${base}/quizzes/essai`, { method: 'PUT', headers: json, body: JSON.stringify({ doc: { titre: 'x', slides: [{ type: 'quiz', question: 'Q', options: ['a'] }] } }) });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.length > 0);
  res = await fetch(`${base}/quizzes/actif`, { method: 'DELETE', headers: WRITE });
  assert.equal(res.status, 409);
});

test('API : envoi de photos (format vérifié sur le contenu)', async () => {
  const send = (bytes, name) => fetch(`${base}/images?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { ...WRITE, 'Content-Type': 'application/octet-stream' }, body: bytes });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  let res = await send(png, 'Ma Photo Été.JPG'); // mauvaise extension : le contenu fait foi
  assert.equal((await res.json()).image, 'images/ma-photo-ete.png');
  res = await send(png, 'Ma Photo Été.JPG');
  assert.equal((await res.json()).image, 'images/ma-photo-ete-2.png');
  res = await send(Buffer.from('\0\0\0\x18ftypheic0000'), 'x.heic');
  assert.equal(res.status, 415);
  assert.match((await res.json()).error, /HEIC/);
  res = await send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg');
  assert.equal(res.status, 415);
  res = await send(Buffer.from('MZ not an image'), 'x.png');
  assert.equal(res.status, 415);
  assert.equal(fs.readdirSync(path.join(root, 'images')).length, 2);
});
