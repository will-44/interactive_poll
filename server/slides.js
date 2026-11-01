import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const TYPES = ['contenu', 'quiz', 'slider', 'avis', 'wordcloud', 'demicercle'];

// Chemin YAML "images/x.jpg" -> URL servie "/images/x.jpg", en vérifiant que le fichier existe.
function imageUrl(rootDir, value, where, errors) {
  if (value == null || value === '') return null;
  const rel = String(value).replace(/^\.?\//, '');
  if (!fs.existsSync(path.join(rootDir, rel))) {
    errors.push(`${where} : image introuvable « ${rel} »`);
  }
  return '/' + rel.split(path.sep).join('/');
}

function readCadre(rootDir, cadre, where, errors) {
  if (cadre == null) return null;
  if (typeof cadre !== 'object') {
    errors.push(`${where} : « cadre » doit contenir « image » ou « texte »`);
    return null;
  }
  if (cadre.image) return { image: imageUrl(rootDir, cadre.image, where, errors) };
  if (cadre.texte != null) return { texte: String(cadre.texte) };
  errors.push(`${where} : « cadre » doit contenir « image » ou « texte »`);
  return null;
}

function isNum(v) {
  return v !== null && v !== '' && !Number.isNaN(Number(v));
}

const UNLIMITED = ['illimité', 'illimite', 'infini', 'infinite'];

// max_mots : un nombre, ou « illimité » / 0 → null (pas de limite).
function readMaxMots(value, fallback, where, errors) {
  if (value == null) return fallback;
  if (UNLIMITED.includes(String(value).toLowerCase().trim()) || Number(value) === 0) return null;
  if (!isNum(value) || Number(value) < 0) {
    errors.push(`${where} : « max_mots » doit être un nombre ou « illimité »`);
    return fallback;
  }
  return Math.round(Number(value));
}

const YES = ['oui', 'yes', 'true'];
const NO = ['non', 'no', 'false'];

// oui / non (ou true / false) ; absent → valeur par défaut.
function readBool(value, fallback, key, where, errors) {
  if (value == null) return fallback;
  const v = String(value).toLowerCase().trim();
  if (YES.includes(v)) return true;
  if (NO.includes(v)) return false;
  errors.push(`${where} : « ${key} » doit valoir oui ou non`);
  return fallback;
}

export function loadSlides(rootDir, file = 'slides.yaml') {
  const errors = [];
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(path.resolve(rootDir, file), 'utf8'));
  } catch (e) {
    return { deck: null, errors: [`Lecture de ${file} impossible : ${e.message}`] };
  }
  if (!doc || !Array.isArray(doc.slides)) {
    return { deck: null, errors: [`${file} : la liste « slides » est manquante`] };
  }

  const background = imageUrl(rootDir, doc.background, 'background global', errors);
  const slides = doc.slides.map((s, i) => {
    const where = `slide ${i + 1}`;
    if (!s || !TYPES.includes(s.type)) {
      errors.push(`${where} : type inconnu « ${s?.type} » (attendu : ${TYPES.join(', ')})`);
      return { type: 'contenu', titre: '?' };
    }
    const base = {
      type: s.type,
      background: s.background ? imageUrl(rootDir, s.background, where, errors) : background,
      cadre: readCadre(rootDir, s.cadre, where, errors),
    };

    if (s.type === 'contenu') {
      return { ...base, titre: s.titre != null ? String(s.titre) : '', texte: s.texte != null ? String(s.texte) : '' };
    }

    if (s.type !== 'demicercle' && (s.question == null || s.question === '')) errors.push(`${where} : « question » manquante`);
    const question = String(s.question ?? '');

    if (s.type === 'demicercle') {
      if (s.gauche == null || s.droite == null) errors.push(`${where} : « gauche » et « droite » sont obligatoires`);
      if (s.cible != null && (!isNum(s.cible) || Number(s.cible) < 0 || Number(s.cible) > 100)) {
        errors.push(`${where} : « cible » doit être un nombre entre 0 (gauche) et 100 (droite)`);
      }
      return {
        ...base,
        question: question || 'Où se cache la cible ?',
        gauche: String(s.gauche ?? ''),
        droite: String(s.droite ?? ''),
        answer: isNum(s.cible) ? Number(s.cible) : null, // null → cible tirée au hasard
        max_mots: readMaxMots(s.max_mots, 1, where, errors),
      };
    }

    if (s.type === 'quiz') {
      const options = Array.isArray(s.options) ? s.options.map(String) : [];
      if (options.length < 2 || options.length > 4) errors.push(`${where} : il faut entre 2 et 4 options`);
      let answer = null;
      if (s.answer != null) {
        answer = options.indexOf(String(s.answer));
        if (answer === -1) {
          errors.push(`${where} : la réponse « ${s.answer} » ne fait pas partie des options`);
          answer = null;
        }
      }
      return { ...base, question, options, answer, melanger: readBool(s.melanger, true, 'melanger', where, errors) };
    }

    if (s.type === 'slider') {
      if (!isNum(s.min) || !isNum(s.max) || Number(s.min) >= Number(s.max)) {
        errors.push(`${where} : « min » et « max » doivent être des nombres avec min < max`);
      }
      const min = Number(s.min ?? 0);
      const max = Number(s.max ?? 100);
      const answer = s.answer != null ? Number(s.answer) : null;
      if (s.answer != null && !isNum(s.answer)) errors.push(`${where} : « answer » doit être un nombre`);
      return {
        ...base,
        question,
        min,
        max,
        step: isNum(s.step) ? Number(s.step) : 1,
        unite: s.unite != null ? String(s.unite) : '',
        tolerance: isNum(s.tolerance) ? Number(s.tolerance) : (max - min) / 10,
        answer: Number.isNaN(answer) ? null : answer,
      };
    }

    if (s.type === 'avis') {
      if ((s.min != null || s.max != null) && !(isNum(s.min ?? 0) && isNum(s.max ?? 10) && Number(s.min ?? 0) < Number(s.max ?? 10))) {
        errors.push(`${where} : « min » et « max » doivent être des nombres avec min < max`);
      }
      return {
        ...base,
        question,
        min: Number(s.min ?? 0),
        max: Number(s.max ?? 10),
        step: isNum(s.step) ? Number(s.step) : 1,
        unite: s.unite != null ? String(s.unite) : '',
        gauche: s.gauche != null ? String(s.gauche) : '',
        droite: s.droite != null ? String(s.droite) : '',
      };
    }

    return { ...base, question, max_mots: readMaxMots(s.max_mots, 3, where, errors) };
  });

  if (errors.length) return { deck: null, errors };
  const deck = {
    titre: doc.titre != null ? String(doc.titre) : 'Interactive Poll',
    podium_texte: doc.podium_texte != null ? String(doc.podium_texte) : 'Thank you for the music !',
    background,
    slides,
  };
  return { deck, errors };
}
