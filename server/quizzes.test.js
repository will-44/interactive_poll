import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { StoreError, createStore, isSlug, normalizeDoc, slugify } from './quizzes.js';

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-test-'));
  fs.mkdirSync(path.join(root, 'images'));
  fs.writeFileSync(path.join(root, 'images', 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return root;
}

const quiz = { titre: 'Mon quiz', slides: [{ type: 'quiz', question: 'Q ?', options: ['A', 'B'], answer: 'B' }] };

test('slugify et isSlug', () => {
  assert.equal(slugify("Les 30 ans d'Alex !"), 'les-30-ans-d-alex');
  assert.equal(slugify('Soirée Été'), 'soiree-ete');
  assert.equal(slugify('!!!'), 'quiz');
  assert.ok(isSlug('mon-quiz-2'));
  for (const bad of ['', '../x', 'a/b', 'A', 'a--b', '-a', 'a.yaml', 'x'.repeat(61), null, 5]) assert.equal(isSlug(bad), false, String(bad));
});

test('normalizeDoc : nombres, options, melanger, encadré', () => {
  const doc = normalizeDoc({
    titre: '  T  ',
    junk: 1,
    slides: [
      { type: 'slider', question: ' Q ', min: '0', max: '10,5', answer: '7', pasconnu: 1 },
      { type: 'quiz', question: 'Q', options: ['1', '', 'x', ' 3 '], answer: '3', melanger: 'non' },
      { type: 'quiz', question: 'Q', options: ['a', 'b'], melanger: 'oui', cadre: { image: '', texte: '' } },
      { type: 'wordcloud', question: 'Q', max_mots: 'illimité' },
    ],
  });
  assert.deepEqual(doc.slides[0], { type: 'slider', question: 'Q', min: 0, max: 10.5, answer: 7 });
  assert.deepEqual(doc.slides[1].options, [1, 'x', 3]);
  assert.equal(doc.slides[1].answer, 3);
  assert.equal(doc.slides[1].melanger, 'non');
  assert.equal('melanger' in doc.slides[2], false);
  assert.equal('cadre' in doc.slides[2], false);
  assert.equal(doc.slides[3].max_mots, 'illimité');
  assert.equal(doc.titre, 'T');
  assert.equal('junk' in doc, false);
  assert.throws(() => normalizeDoc({ titre: 'x' }), StoreError);
});

test('enregistrement : validation, .bak, aucun fichier invalide', () => {
  const root = tmpRoot();
  const store = createStore(root);
  const slug = store.create({ titre: 'Mon quiz' });
  assert.equal(slug, 'mon-quiz');
  assert.equal(store.create({ titre: 'Mon quiz' }), 'mon-quiz-2');

  store.save(slug, quiz);
  const before = fs.readFileSync(path.join(root, 'quizzes', 'mon-quiz.yaml'), 'utf8');
  store.save(slug, { ...quiz, titre: 'Autre' });
  assert.equal(fs.readFileSync(path.join(root, 'quizzes', 'mon-quiz.yaml.bak'), 'utf8'), before);

  const bad = { titre: 'x', slides: [{ type: 'quiz', question: 'Q', options: ['seule'] }] };
  assert.throws(() => store.save(slug, bad), (e) => e.status === 422 && e.extra.errors.length > 0);
  assert.match(fs.readFileSync(path.join(root, 'quizzes', 'mon-quiz.yaml'), 'utf8'), /titre: Autre/);

  const missing = { titre: 'x', slides: [{ type: 'contenu', titre: 'T', cadre: { image: 'images/nope.jpg' } }] };
  assert.throws(() => store.save(slug, missing), (e) => e.status === 422);
});

test('noms de quiz dangereux refusés', () => {
  const store = createStore(tmpRoot());
  for (const bad of ['../package', '..', 'a/b', 'a\\b', '']) {
    assert.throws(() => store.read(bad), (e) => e.status === 400, bad);
    assert.throws(() => store.save(bad, quiz), (e) => e.status === 400, bad);
    assert.throws(() => store.remove(bad), (e) => e.status === 400, bad);
  }
});

test('liste, copie, suppression (mise de côté en .bak)', () => {
  const root = tmpRoot();
  const store = createStore(root);
  const slug = store.create({ titre: 'Un' });
  store.save(slug, quiz);
  const copy = store.create({ from: slug, titre: 'Deux' });
  assert.equal(copy, 'deux');
  assert.deepEqual(store.list().map((q) => [q.slug, q.titre, q.slides, q.errors]), [['deux', 'Deux', 1, 0], ['un', 'Mon quiz', 1, 0]]);
  store.remove(copy);
  assert.deepEqual(store.slugs(), ['un']);
  assert.ok(fs.existsSync(path.join(root, 'quizzes', 'deux.yaml.bak')));
});

test('import : photos manquantes signalées sans bloquer', () => {
  const store = createStore(tmpRoot());
  const { slug, missing } = store.importText('titre: Venu\nslides:\n  - type: contenu\n    titre: Hi\n    cadre: { image: images/a.svg }\n  - type: contenu\n    titre: Yo\n    cadre: { image: images/inconnue.jpg }\n');
  assert.equal(slug, 'venu');
  assert.deepEqual(missing, ['images/inconnue.jpg']);
  assert.throws(() => store.importText('foo: ['), (e) => e.status === 400);
  assert.throws(() => store.importText('titre: x\nslides:\n  - type: truc\n'), (e) => e.status === 422);
});

test('migration d\'un ancien slides.yaml', () => {
  const root = tmpRoot();
  const store = createStore(root);
  assert.equal(store.migrateLegacy(), null);
  fs.writeFileSync(path.join(root, 'slides.yaml'), '# mes notes\ntitre: Ma soirée\nslides:\n  - type: contenu\n    titre: Coucou\n');
  assert.equal(store.migrateLegacy(), 'ma-soiree');
  assert.match(fs.readFileSync(path.join(root, 'quizzes', 'ma-soiree.yaml'), 'utf8'), /# mes notes/);
  assert.ok(fs.existsSync(path.join(root, 'slides.yaml.importe')));
  assert.equal(fs.existsSync(path.join(root, 'slides.yaml')), false);
});
