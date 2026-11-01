import fs from 'node:fs';
import path from 'node:path';

const POINTS = 1000;
const MAX_NAME = 20;
const MAX_WORD = 25;

// "Génial " -> "genial", "d’eph" -> "d'eph" : sert à regrouper les mots du nuage.
export function normalizeWord(w) {
  return w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreAnswer(slide, value, correct) {
  if (value == null || correct == null) return 0;
  if (slide.type === 'quiz') return String(value) === String(correct) ? POINTS : 0;
  if (slide.type === 'slider') {
    const diff = Math.abs(Number(value) - Number(correct));
    if (slide.tolerance <= 0) return diff === 0 ? POINTS : 0;
    return Math.max(0, Math.round(POINTS * (1 - diff / slide.tolerance)));
  }
  return 0;
}

const isQuestion = (slide) => slide && slide.type !== 'contenu';
const isScored = (slide) => slide && (slide.type === 'quiz' || slide.type === 'slider');
const hasWords = (slide) => slide && (slide.type === 'wordcloud' || slide.type === 'demicercle');
const randomTarget = () => 10 + Math.round(Math.random() * 80);

// Ordre d'affichage des options d'un quiz, tiré une fois puis gardé (null = ordre du YAML).
function optionOrder(slide) {
  if (slide.type !== 'quiz' || !slide.melanger) return null;
  const order = slide.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export class Game {
  constructor(stateFile) {
    this.stateFile = stateFile;
    this.deck = { titre: 'Interactive Poll', podium_texte: '', background: null, slides: [] };
    this.errors = [];
    this.index = -1; // -1 = accueil, slides.length = podium
    this.players = {}; // id -> { id, name }
    this.slideStates = {}; // index -> { type, phase, answers, correct, points }
    this.kicked = new Set();
    this.saveTimer = null;
    this.load();
  }

  // --- persistance ---------------------------------------------------------

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.index = data.index ?? -1;
      this.players = data.players ?? {};
      this.slideStates = data.slideStates ?? {};
      this.kicked = new Set(data.kicked ?? []);
    } catch {
      // pas de sauvegarde (ou illisible) : partie neuve
    }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 100);
  }

  // Écriture atomique : un plantage en cours d'écriture ne laisse jamais un JSON tronqué.
  saveNow() {
    clearTimeout(this.saveTimer);
    const data = { index: this.index, players: this.players, slideStates: this.slideStates, kicked: [...this.kicked] };
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.stateFile);
  }

  // --- slides --------------------------------------------------------------

  setDeck(deck) {
    this.deck = deck;
    this.errors = [];
    // On oublie l'état des slides qui ont changé de type depuis le dernier chargement.
    // Une réponse corrigée dans le YAML s'applique aux questions pas encore révélées.
    for (const [key, st] of Object.entries(this.slideStates)) {
      const slide = deck.slides[key];
      if (slide?.type !== st.type) {
        delete this.slideStates[key];
        continue;
      }
      if (st.phase !== 'revealed' && slide.answer != null) st.correct = slide.answer;
      // Mélange activé/désactivé ou nombre d'options changé dans le YAML : on retire l'ordre.
      if (slide.type === 'quiz' && (!slide.melanger ? st.order != null : st.order?.length !== slide.options.length)) {
        st.order = optionOrder(slide);
      }
    }
    this.index = Math.min(this.index, deck.slides.length);
    this.ensureState();
    this.save();
  }

  get slide() {
    return this.deck.slides[this.index];
  }

  get state() {
    return this.slideStates[this.index];
  }

  ensureState() {
    const slide = this.slide;
    if (isQuestion(slide) && !this.state) {
      this.slideStates[this.index] = {
        type: slide.type,
        phase: 'open',
        answers: {},
        correct: slide.answer ?? (slide.type === 'demicercle' ? randomTarget() : null),
        points: {},
        order: optionOrder(slide),
      };
    }
  }

  // Quitter une question verrouille ses votes : on peut revenir la révéler, jamais revoter.
  leaveCurrent() {
    if (this.state?.phase === 'open') this.state.phase = 'closed';
  }

  go(delta) {
    // Demi-cercle : le premier « Suivante » révèle la cible, le second avance.
    if (delta > 0 && this.slide?.type === 'demicercle' && this.state?.phase !== 'revealed') {
      this.reveal();
      return;
    }
    const next = Math.max(-1, Math.min(this.deck.slides.length, this.index + delta));
    if (next === this.index) return;
    this.leaveCurrent();
    this.index = next;
    this.ensureState();
    this.save();
  }

  close() {
    if (this.state?.phase === 'open') {
      this.state.phase = 'closed';
      this.save();
    }
  }

  setCorrect(value) {
    const slide = this.slide;
    const st = this.state;
    if (!isScored(slide) || !st || st.phase === 'revealed') return;
    if (slide.type === 'quiz') {
      const i = Number(value);
      if (Number.isInteger(i) && i >= 0 && i < slide.options.length) st.correct = i;
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) st.correct = n;
    }
    this.save();
  }

  reveal() {
    const slide = this.slide;
    const st = this.state;
    if (!st || st.phase === 'revealed' || st.correct == null) return;
    if (slide.type === 'demicercle') {
      st.phase = 'revealed';
      this.save();
      return;
    }
    if (!isScored(slide)) return;
    st.phase = 'revealed';
    st.points = {};
    for (const [pid, value] of Object.entries(st.answers)) {
      st.points[pid] = scoreAnswer(slide, value, st.correct);
    }
    this.save();
  }

  reset() {
    this.index = -1;
    this.players = {};
    this.slideStates = {};
    this.kicked.clear();
    this.save();
  }

  // --- joueurs -------------------------------------------------------------

  join(id, rawName) {
    if (!id || typeof id !== 'string') return { error: 'Identifiant manquant' };
    if (this.kicked.has(id)) return { kicked: true };
    if (this.players[id]) return { player: this.players[id] };

    const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (!name) return { error: 'Écris ton prénom' };
    const taken = new Set(Object.values(this.players).map((p) => p.name.toLowerCase()));
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} (${n})`;

    this.players[id] = { id, name: unique };
    this.save();
    return { player: this.players[id] };
  }

  kick(id) {
    if (!this.players[id]) return;
    delete this.players[id];
    for (const st of Object.values(this.slideStates)) {
      delete st.answers[id];
      delete st.points[id];
    }
    this.kicked.add(id);
    this.save();
  }

  answer(pid, value) {
    const slide = this.slide;
    const st = this.state;
    if (!this.players[pid] || !st || st.phase !== 'open') return;

    if (slide.type === 'quiz') {
      const i = Number(value);
      if (!Number.isInteger(i) || i < 0 || i >= slide.options.length) return;
      st.answers[pid] = i;
    } else if (slide.type === 'slider' || slide.type === 'avis') {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      st.answers[pid] = Math.min(slide.max, Math.max(slide.min, n));
    } else if (hasWords(slide)) {
      // Un mot à la fois : une chaîne ajoute un mot, { retirer: i } enlève le i-ème.
      const words = st.answers[pid] ?? [];
      if (typeof value === 'string') {
        const w = value.replace(/\s+/g, ' ').trim().slice(0, MAX_WORD);
        const key = normalizeWord(w);
        if (!key) return 'Écris un mot';
        if (words.some((x) => normalizeWord(x) === key)) return 'Tu as déjà envoyé ce mot';
        if (slide.max_mots != null && words.length >= slide.max_mots) return 'Tu as utilisé tous tes mots';
        st.answers[pid] = [...words, w];
      } else if (Number.isInteger(value?.retirer)) {
        const rest = words.filter((_, i) => i !== value.retirer);
        if (rest.length) st.answers[pid] = rest;
        else delete st.answers[pid];
      } else {
        return;
      }
    }
    this.save();
  }

  // --- vue envoyée aux écrans ----------------------------------------------

  scores() {
    const totals = {};
    for (const id of Object.keys(this.players)) totals[id] = 0;
    for (const st of Object.values(this.slideStates)) {
      for (const [pid, pts] of Object.entries(st.points)) {
        if (pid in totals) totals[pid] += pts;
      }
    }
    return totals;
  }

  cloud(st) {
    const groups = new Map();
    for (const words of Object.values(st.answers)) {
      for (const w of words) {
        const key = normalizeWord(w);
        const g = groups.get(key) ?? { text: w, count: 0 };
        g.count++;
        groups.set(key, g);
      }
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  snapshot(extra) {
    const totals = this.scores();
    const players = Object.values(this.players)
      .map((p) => ({ ...p, score: totals[p.id] }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const st = this.state;
    return {
      ...extra,
      titre: this.deck.titre,
      podium_texte: this.deck.podium_texte,
      background: this.deck.background,
      slides: this.deck.slides,
      index: this.index,
      total: this.deck.slides.length,
      errors: this.errors,
      players,
      current: st
        ? {
            ...st,
            answered: Object.keys(st.answers).length,
            cloud: hasWords(st) ? this.cloud(st) : null,
          }
        : null,
    };
  }
}
