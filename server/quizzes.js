import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { collectImages, loadSlides, parseDoc } from './slides.js';

export class StoreError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLIDES = 300;

export function isSlug(value) {
  return typeof value === 'string' && value.length <= 60 && SLUG_RE.test(value);
}

// « Les 30 ans d'Alex ! » -> « les-30-ans-d-alex »
export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'quiz';
}

// --- nettoyage du document envoyé par l'éditeur ------------------------------

const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const INT = /^-?\d+$/;
const NUMBER = /^-?\d+([.,]\d+)?$/;

function toNumber(v) {
  if (typeof v === 'string' && NUMBER.test(v.trim())) return Number(v.trim().replace(',', '.'));
  return v;
}

function toText(v) {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : v;
}

// Les entiers restent des entiers dans le YAML (options: [1, 3, 4, 7]), le reste du texte.
function toOption(v) {
  const t = toText(v);
  return typeof t === 'string' && INT.test(t) ? Number(t) : t;
}

const FIELDS = {
  contenu: [['titre', 'text'], ['texte', 'text']],
  quiz: [['question', 'text'], ['options', 'options'], ['answer', 'option'], ['melanger', 'melanger']],
  slider: [['question', 'text'], ['min', 'number'], ['max', 'number'], ['step', 'number'], ['unite', 'text'], ['tolerance', 'number'], ['answer', 'number']],
  avis: [['question', 'text'], ['gauche', 'text'], ['droite', 'text'], ['min', 'number'], ['max', 'number'], ['step', 'number'], ['unite', 'text']],
  wordcloud: [['question', 'text'], ['max_mots', 'maxMots']],
  demicercle: [['question', 'text'], ['gauche', 'text'], ['droite', 'text'], ['cible', 'number'], ['max_mots', 'maxMots']],
};

function cleanField(kind, v) {
  switch (kind) {
    case 'text':
      return blank(v) ? undefined : toText(v);
    case 'number':
      return blank(v) ? undefined : toNumber(v);
    case 'option':
      return blank(v) ? undefined : toOption(v);
    case 'options':
      return Array.isArray(v) ? v.filter((o) => !blank(o)).map(toOption) : [];
    case 'maxMots':
      return blank(v) ? undefined : toNumber(typeof v === 'string' ? v.trim() : v);
    case 'melanger': {
      const no = ['non', 'no', 'false'].includes(String(v).toLowerCase().trim()) || v === false;
      return no ? 'non' : undefined; // « oui » est la valeur par défaut : on ne l'écrit pas
    }
    default:
      return undefined;
  }
}

function cleanSlide(raw) {
  const type = raw?.type;
  const fields = FIELDS[type];
  if (!fields) return { type: typeof type === 'string' ? type : '?' }; // parseDoc signalera le type inconnu
  const out = { type };
  for (const [key, kind] of fields) {
    const value = cleanField(kind, raw[key]);
    if (value !== undefined) out[key] = value;
  }
  if (!blank(raw.background)) out.background = toText(raw.background);
  const cadre = raw.cadre;
  if (cadre && typeof cadre === 'object') {
    if (!blank(cadre.image)) out.cadre = { image: toText(cadre.image) };
    else if (!blank(cadre.texte)) out.cadre = { texte: toText(cadre.texte) };
  }
  return out;
}

// Ne garde que les clés connues, dans un ordre fixe : le fichier reste lisible à la main.
export function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new StoreError(400, 'Quiz illisible');
  if (!Array.isArray(raw.slides)) throw new StoreError(400, 'La liste « slides » est manquante');
  if (raw.slides.length > MAX_SLIDES) throw new StoreError(400, `Un quiz est limité à ${MAX_SLIDES} slides`);
  const doc = { titre: blank(raw.titre) ? 'Mon quiz' : String(toText(raw.titre)) };
  if (typeof raw.podium_texte === 'string') doc.podium_texte = toText(raw.podium_texte);
  if (!blank(raw.background)) doc.background = toText(raw.background);
  doc.slides = raw.slides.map(cleanSlide);
  return doc;
}

export function serialize(doc) {
  const header = [
    `# Quiz « ${doc.titre.replace(/\n/g, ' ')} »`,
    '#',
    "# Fichier généré par l'éditeur de quiz (page /editor de l'application).",
    '# Tu peux aussi le modifier à la main : voir le README, section « Écrire vos questions ».',
    '# La version précédente est gardée à côté, avec l\'extension .yaml.bak.',
    '',
    '',
  ].join('\n');
  return header + yaml.dump(doc, { lineWidth: -1, noRefs: true, flowLevel: 3 });
}

// --- stockage ----------------------------------------------------------------

export function createStore(rootDir) {
  const dir = path.join(rootDir, 'quizzes');
  const rel = (slug) => `quizzes/${slug}.yaml`;

  function fileOf(slug) {
    if (!isSlug(slug)) throw new StoreError(400, 'Nom de quiz invalide');
    const file = path.join(dir, `${slug}.yaml`);
    if (path.dirname(file) !== dir) throw new StoreError(400, 'Nom de quiz invalide');
    return file;
  }

  function slugs() {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.yaml') && isSlug(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort();
  }

  function rawDoc(slug) {
    const file = fileOf(slug);
    if (!fs.existsSync(file)) throw new StoreError(404, 'Quiz introuvable');
    try {
      return yaml.load(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  function uniqueSlug(base) {
    let slug = base;
    for (let n = 2; fs.existsSync(path.join(dir, `${slug}.yaml`)); n++) slug = `${base.slice(0, 56)}-${n}`;
    return slug;
  }

  function writeAtomic(slug, text) {
    const file = fileOf(slug);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }

  // Valide puis écrit. Un quiz invalide n'est jamais enregistré : le serveur ne saurait pas le jouer.
  function writeValidated(slug, raw) {
    const doc = normalizeDoc(raw);
    const { errors } = parseDoc(rootDir, doc);
    if (errors.length) throw new StoreError(422, 'Le quiz contient des erreurs', { errors });
    writeAtomic(slug, serialize(doc));
    return doc;
  }

  return {
    dir,
    rel,
    slugs,

    list() {
      return slugs().map((slug) => {
        const doc = rawDoc(slug);
        const { errors } = loadSlides(rootDir, rel(slug));
        return {
          slug,
          titre: typeof doc?.titre === 'string' && doc.titre ? doc.titre : slug,
          slides: Array.isArray(doc?.slides) ? doc.slides.length : 0,
          errors: errors.length,
        };
      });
    },

    // Document brut (tel que dans le YAML) : c'est lui que l'éditeur modifie, jamais le « deck » transformé.
    read(slug) {
      const doc = rawDoc(slug);
      const { errors } = loadSlides(rootDir, rel(slug));
      return { slug, doc: doc && typeof doc === 'object' ? doc : { titre: slug, slides: [] }, errors, images: collectImages(doc) };
    },

    // Quiz prêt à jouer.
    load(slug) {
      fileOf(slug);
      return loadSlides(rootDir, rel(slug));
    },

    save(slug, raw) {
      if (!fs.existsSync(fileOf(slug))) throw new StoreError(404, 'Quiz introuvable');
      return writeValidated(slug, raw);
    },

    // Nouveau quiz vide, ou copie d'un quiz existant (from = son nom).
    create({ titre, from } = {}) {
      let doc;
      if (from) {
        const source = rawDoc(from);
        if (!source) throw new StoreError(422, 'Le quiz à copier est illisible');
        doc = { ...source, titre: blank(titre) ? `${source.titre ?? from} (copie)` : String(titre) };
      } else {
        const background = fs.existsSync(path.join(rootDir, 'images', 'fond-mer.svg')) ? 'images/fond-mer.svg' : undefined;
        doc = {
          titre: blank(titre) ? 'Mon quiz' : String(titre),
          podium_texte: 'Thank you for the music !',
          background,
          slides: [{ type: 'contenu', titre: 'Bienvenue !', texte: 'Sortez vos téléphones, le quiz commence.' }],
        };
      }
      const clean = normalizeDoc(doc);
      const slug = uniqueSlug(slugify(clean.titre));
      writeAtomic(slug, serialize(clean));
      return slug;
    },

    // Mis de côté en .bak plutôt qu'effacé.
    remove(slug) {
      const file = fileOf(slug);
      if (!fs.existsSync(file)) throw new StoreError(404, 'Quiz introuvable');
      fs.renameSync(file, `${file}.bak`);
    },

    exportText(slug) {
      fileOf(slug);
      const file = fileOf(slug);
      if (!fs.existsSync(file)) throw new StoreError(404, 'Quiz introuvable');
      return fs.readFileSync(file, 'utf8');
    },

    // Quiz venu d'ailleurs : ses photos peuvent manquer, on le dit sans bloquer l'import.
    importText(text) {
      let raw;
      try {
        raw = yaml.load(text);
      } catch (e) {
        throw new StoreError(400, `Ce fichier n'est pas du YAML valide : ${e.message}`);
      }
      const doc = normalizeDoc(raw);
      const { errors } = parseDoc(rootDir, doc, { lenient: true });
      if (errors.length) throw new StoreError(422, 'Le quiz contient des erreurs', { errors });
      const slug = uniqueSlug(slugify(doc.titre));
      writeAtomic(slug, serialize(doc));
      const missing = collectImages(doc).filter((img) => !fs.existsSync(path.join(rootDir, img)));
      return { slug, missing };
    },

    // Ancien format : un slides.yaml à la racine devient un quiz de quizzes/ (le fichier d'origine est renommé).
    migrateLegacy() {
      const legacy = path.join(rootDir, 'slides.yaml');
      if (!fs.existsSync(legacy)) return null;
      let raw;
      try {
        raw = yaml.load(fs.readFileSync(legacy, 'utf8'));
      } catch (e) {
        return null; // illisible : on le laisse où il est
      }
      if (!raw || !Array.isArray(raw.slides)) return null;
      fs.mkdirSync(dir, { recursive: true });
      const slug = uniqueSlug(slugify(raw.titre ?? 'mon-quiz'));
      // Copie telle quelle (commentaires inclus) : l'utilisateur ne perd rien.
      fs.copyFileSync(legacy, path.join(dir, `${slug}.yaml`));
      fs.renameSync(legacy, `${legacy}.importe`);
      return slug;
    },
  };
}
