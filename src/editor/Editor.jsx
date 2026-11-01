import { createContext, useContext, useEffect, useRef, useState } from 'react';

// --- dialogue avec le serveur ------------------------------------------------

async function api(method, url, body, { text = false } = {}) {
  const headers = { 'X-Requested-With': 'interactive-poll' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = text ? 'text/plain' : 'application/json';
    payload = text ? body : JSON.stringify(body);
  }
  const res = await fetch('/api' + url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.errors = data.errors;
    throw err;
  }
  return data;
}

// --- types de slides -----------------------------------------------------------

const TYPES = {
  contenu: { label: 'Contenu', hint: 'Un titre et un texte, sans vote', make: () => ({ type: 'contenu', titre: '', texte: '' }) },
  quiz: { label: 'Quiz', hint: '2 à 4 réponses, dont une bonne', make: () => ({ type: 'quiz', question: '', options: ['', ''], answer: '' }) },
  slider: { label: 'Slider', hint: 'Les invités choisissent un nombre', make: () => ({ type: 'slider', question: '', min: 0, max: 10, step: 1 }) },
  avis: { label: 'Avis du public', hint: 'Un curseur, sans bonne réponse', make: () => ({ type: 'avis', question: '', gauche: '', droite: '' }) },
  wordcloud: { label: 'Nuage de mots', hint: 'Chaque invité envoie des mots', make: () => ({ type: 'wordcloud', question: '', max_mots: 3 }) },
  demicercle: { label: 'Demi-cercle', hint: 'Les mots se placent entre deux pôles', make: () => ({ type: 'demicercle', question: '', gauche: '', droite: '', max_mots: 3 }) },
};

const summary = (s) => s.titre || s.question || (s.gauche && s.droite ? `${s.gauche} ↔ ${s.droite}` : '') || '(vide)';
let keyCounter = 0;
const withKey = (s) => ({ ...s, _k: ++keyCounter });
const withKeys = (doc) => ({ ...doc, slides: (doc.slides ?? []).map(withKey) });

function usedImages(doc) {
  const set = new Set();
  if (doc.background) set.add(doc.background);
  for (const s of doc.slides) {
    if (s.background) set.add(s.background);
    if (s.cadre?.image) set.add(s.cadre.image);
  }
  return [...set];
}

// --- petits composants ---------------------------------------------------------

const Images = createContext({ images: [], upload: async () => {} });

function Field({ label, hint, wide, children }) {
  return (
    <label className={`e-field${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Text({ value, onChange, ...rest }) {
  return <input className="e-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function Modal({ title, children, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="e-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="e-modal-box">
        <h2>{title}</h2>
        <div className="e-modal-body">{children}</div>
        <div className="e-modal-actions">{actions}</div>
      </div>
    </div>
  );
}

function ImagePicker({ value, onChange }) {
  const { images, upload } = useContext(Images);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const missing = value && !images.includes(value);

  const onFiles = async (files) => {
    setBusy(true);
    setError('');
    let last = null;
    for (const file of files) {
      try {
        last = await upload(file);
      } catch (e) {
        setError(`${file.name} : ${e.message}`);
      }
    }
    setBusy(false);
    if (last) onChange(last);
  };

  return (
    <div className="e-image">
      <div className={`e-thumb${missing ? ' is-missing' : ''}`}>{value ? <img src={'/' + value} alt="" /> : <span>aucune</span>}</div>
      <div className="e-image-side">
        <code>{value || '—'}</code>
        {missing && <small className="e-warn">Cette image n'existe pas dans le dossier images/.</small>}
        <div className="e-row">
          <button type="button" className="e-btn is-small" onClick={() => setOpen(true)}>
            Choisir…
          </button>
          {value && (
            <button type="button" className="e-btn is-small is-ghost" onClick={() => onChange('')}>
              Retirer
            </button>
          )}
        </div>
      </div>
      {open && (
        <Modal
          title="Choisir une image"
          onClose={() => setOpen(false)}
          actions={
            <>
              <input ref={fileRef} type="file" multiple accept="image/*,.svg" hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
              <button type="button" className="e-btn is-primary" disabled={busy} onClick={() => fileRef.current.click()}>
                {busy ? 'Envoi…' : '＋ Ajouter une photo'}
              </button>
              <button type="button" className="e-btn is-ghost" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </>
          }
        >
          {error && <p className="e-error">{error}</p>}
          <div className="e-gallery">
            {images.map((img) => (
              <button key={img} type="button" className={`e-gallery-item${img === value ? ' is-picked' : ''}`} title={img} onClick={() => { onChange(img); setOpen(false); }}>
                <img src={'/' + img} alt="" loading="lazy" />
                <span>{img.replace('images/', '')}</span>
              </button>
            ))}
            {images.length === 0 && <p>Aucune image pour l'instant : ajoute une photo.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- formulaire d'une slide ----------------------------------------------------

function SlideForm({ slide, set }) {
  const t = slide.type;
  const opts = slide.options ?? [];

  const setOption = (i, v) => {
    const old = opts[i];
    const patch = { options: opts.map((o, j) => (j === i ? v : o)) };
    if (String(slide.answer ?? '') !== '' && String(slide.answer) === String(old)) patch.answer = v; // la bonne réponse suit le texte
    set(patch);
  };
  const removeOption = (i) => {
    const patch = { options: opts.filter((_, j) => j !== i) };
    if (String(slide.answer ?? '') === String(opts[i])) patch.answer = '';
    set(patch);
  };
  const answerIndex = opts.findIndex((o) => String(o) === String(slide.answer ?? '') && String(o) !== '');
  const shuffle = !['non', 'no', 'false'].includes(String(slide.melanger).toLowerCase());
  const cadre = slide.cadre?.image !== undefined ? 'image' : slide.cadre?.texte !== undefined ? 'texte' : 'aucun';
  const setCadre = (kind) => set({ cadre: kind === 'image' ? { image: '' } : kind === 'texte' ? { texte: '' } : undefined });

  return (
    <div className="e-form">
      {t === 'contenu' && (
        <>
          <Field label="Titre" wide>
            <Text value={slide.titre} onChange={(v) => set({ titre: v })} />
          </Field>
          <Field label="Texte" wide>
            <textarea className="e-input" rows={3} value={slide.texte ?? ''} onChange={(e) => set({ texte: e.target.value })} />
          </Field>
        </>
      )}

      {t !== 'contenu' && (
        <Field label={t === 'demicercle' ? 'Question (facultative)' : 'Question'} wide>
          <Text value={slide.question} onChange={(v) => set({ question: v })} />
        </Field>
      )}

      {t === 'quiz' && (
        <>
          <div className="e-field is-wide">
            <span>Réponses possibles (2 à 4)</span>
            {opts.map((o, i) => (
              <div className="e-row" key={i}>
                <Text value={String(o ?? '')} onChange={(v) => setOption(i, v)} placeholder={`Réponse ${i + 1}`} />
                {opts.length > 2 && (
                  <button type="button" className="e-btn is-small is-ghost" aria-label={`Retirer la réponse ${i + 1}`} onClick={() => removeOption(i)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            {opts.length < 4 && (
              <button type="button" className="e-btn is-small is-ghost e-self-start" onClick={() => set({ options: [...opts, ''] })}>
                ＋ Ajouter une réponse
              </button>
            )}
          </div>
          <Field label="Bonne réponse" hint="« Aucune » : pas de points pour cette question.">
            <select className="e-input" value={answerIndex} onChange={(e) => set({ answer: e.target.value === '-1' ? '' : opts[Number(e.target.value)] })}>
              <option value={-1}>Aucune</option>
              {opts.map((o, i) => String(o) !== '' && (
                <option key={i} value={i}>
                  {String(o)}
                </option>
              ))}
            </select>
          </Field>
          <label className="e-check">
            <input type="checkbox" checked={shuffle} onChange={(e) => set({ melanger: e.target.checked ? 'oui' : 'non' })} />
            Mélanger l'ordre des réponses
          </label>
        </>
      )}

      {t === 'slider' && (
        <>
          <Field label="Minimum"><Text inputMode="decimal" value={slide.min} onChange={(v) => set({ min: v })} /></Field>
          <Field label="Maximum"><Text inputMode="decimal" value={slide.max} onChange={(v) => set({ max: v })} /></Field>
          <Field label="Pas" hint="De combien avance le curseur."><Text inputMode="decimal" value={slide.step} onChange={(v) => set({ step: v })} /></Field>
          <Field label="Unité" hint="Ex. : pays, ans, €"><Text value={slide.unite} onChange={(v) => set({ unite: v })} /></Field>
          <Field label="Bonne réponse" hint="Facultatif."><Text inputMode="decimal" value={slide.answer} onChange={(v) => set({ answer: v })} /></Field>
          <Field label="Tolérance" hint="Écart accepté autour de la bonne réponse."><Text inputMode="decimal" value={slide.tolerance} onChange={(v) => set({ tolerance: v })} /></Field>
        </>
      )}

      {t === 'avis' && (
        <>
          <Field label="Côté gauche"><Text value={slide.gauche} onChange={(v) => set({ gauche: v })} /></Field>
          <Field label="Côté droit"><Text value={slide.droite} onChange={(v) => set({ droite: v })} /></Field>
          <Field label="Minimum" hint="0 par défaut"><Text inputMode="decimal" value={slide.min} onChange={(v) => set({ min: v })} /></Field>
          <Field label="Maximum" hint="10 par défaut"><Text inputMode="decimal" value={slide.max} onChange={(v) => set({ max: v })} /></Field>
          <Field label="Pas"><Text inputMode="decimal" value={slide.step} onChange={(v) => set({ step: v })} /></Field>
          <Field label="Unité"><Text value={slide.unite} onChange={(v) => set({ unite: v })} /></Field>
        </>
      )}

      {t === 'demicercle' && (
        <>
          <Field label="Pôle gauche"><Text value={slide.gauche} onChange={(v) => set({ gauche: v })} /></Field>
          <Field label="Pôle droit"><Text value={slide.droite} onChange={(v) => set({ droite: v })} /></Field>
          <Field label="Position cible" hint="De 0 (gauche) à 100 (droite). Facultatif."><Text inputMode="decimal" value={slide.cible} onChange={(v) => set({ cible: v })} /></Field>
        </>
      )}

      {(t === 'wordcloud' || t === 'demicercle') && (
        <Field label="Mots par invité" hint="Un nombre, ou « illimité ».">
          <Text value={slide.max_mots} onChange={(v) => set({ max_mots: v })} />
        </Field>
      )}

      <div className="e-field is-wide e-extra">
        <span>Encadré</span>
        <div className="e-row">
          <select className="e-input e-narrow" value={cadre} onChange={(e) => setCadre(e.target.value)}>
            <option value="aucun">Aucun</option>
            <option value="image">Une image</option>
            <option value="texte">Un texte (indice…)</option>
          </select>
          {cadre === 'texte' && <Text value={slide.cadre.texte} onChange={(v) => set({ cadre: { texte: v } })} placeholder="Texte de l'encadré" />}
        </div>
        {cadre === 'image' && <ImagePicker value={slide.cadre.image} onChange={(v) => set({ cadre: { image: v } })} />}
      </div>
      <div className="e-field is-wide e-extra">
        <span>Fond de cette slide</span>
        <ImagePicker value={slide.background} onChange={(v) => set({ background: v })} />
        <small>Vide : le fond général du quiz est utilisé.</small>
      </div>
    </div>
  );
}

// --- l'éditeur -----------------------------------------------------------------

export function Editor() {
  const [quizzes, setQuizzes] = useState([]);
  const [active, setActive] = useState(null);
  const [slug, setSlug] = useState(null);
  const [doc, setDoc] = useState(null);
  const [saved, setSaved] = useState('');
  const [errors, setErrors] = useState([]);
  const [images, setImages] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [stopped, setStopped] = useState(false);
  const importRef = useRef(null);

  const dirty = doc !== null && JSON.stringify(doc) !== saved;
  const say = (text, kind = 'ok') => setNotice({ text, kind });
  const openDialog = (d) => setDialog({ ...d, id: ++keyCounter });
  const fail = (e) => say(e.message, 'err');

  // --- chargement ---

  const refreshList = async () => {
    const res = await api('GET', '/quizzes');
    setQuizzes(res.quizzes);
    setActive(res.active);
    return res;
  };
  const refreshImages = async () => setImages((await api('GET', '/images')).images);

  const load = async (target) => {
    const res = await api('GET', `/quizzes/${target}`);
    const loaded = withKeys(res.doc);
    setSlug(target);
    setDoc(loaded);
    setSaved(JSON.stringify(loaded));
    setErrors(res.errors);
    setOpenKey(loaded.slides[0]?._k ?? null);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await refreshList();
        await refreshImages();
        const first = res.active ?? res.quizzes[0]?.slug;
        if (first) await load(first);
      } catch (e) {
        fail(e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice || notice.kind === 'err') return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Vérification en direct, avec les mêmes messages que le serveur.
  useEffect(() => {
    if (!doc) return undefined;
    const t = setTimeout(() => {
      api('POST', '/validate', { doc }).then((r) => setErrors(r.errors)).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [doc]);

  // --- modifications du quiz ---

  const setField = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const setSlide = (key, patch) => setDoc((d) => ({ ...d, slides: d.slides.map((s) => (s._k === key ? { ...s, ...patch } : s)) }));
  const move = (i, delta) =>
    setDoc((d) => {
      const slides = [...d.slides];
      const j = i + delta;
      if (j < 0 || j >= slides.length) return d;
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...d, slides };
    });
  const duplicate = (i) => {
    const copy = withKey(JSON.parse(JSON.stringify(doc.slides[i])));
    setDoc((d) => ({ ...d, slides: [...d.slides.slice(0, i + 1), copy, ...d.slides.slice(i + 1)] }));
    setOpenKey(copy._k);
  };
  const remove = (i) => {
    setDoc((d) => ({ ...d, slides: d.slides.filter((_, j) => j !== i) }));
    say('Slide supprimée (pas encore enregistré).');
  };
  const add = (type) => {
    const slide = withKey(TYPES[type].make());
    setDoc((d) => ({ ...d, slides: [...d.slides, slide] }));
    setOpenKey(slide._k);
  };

  // --- actions ---

  const upload = async (file) => {
    const res = await fetch(`/api/images?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'interactive-poll', 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    await refreshImages();
    return data.image;
  };

  const save = async () => {
    try {
      const res = await api('PUT', `/quizzes/${slug}`, { doc });
      setSaved(JSON.stringify(doc));
      await refreshList();
      say(res.applied ? 'Enregistré et appliqué à la partie en cours.' : 'Enregistré.');
      return true;
    } catch (e) {
      if (e.errors) setErrors(e.errors);
      fail(e);
      return false;
    }
  };

  // Changer de quiz (ou en créer un) ferait perdre ce qui n'est pas enregistré : on demande d'abord.
  const guardDirty = (action) => {
    if (!dirty) return action();
    openDialog({
      title: 'Modifications non enregistrées',
      text: 'Si tu continues maintenant, ce que tu viens de modifier sera perdu.',
      confirm: 'Abandonner les modifications',
      danger: true,
      onConfirm: action,
    });
    return undefined;
  };

  const choose = (target) => {
    if (target !== slug) guardDirty(() => load(target).catch(fail));
  };

  const launch = () => {
    openDialog({
      title: `Lancer « ${doc.titre} » ?`,
      text: 'Cela démarre une nouvelle partie : la partie en cours est remise à zéro, les joueurs et tous les scores sont effacés. Les téléphones déjà connectés se réinscriront tout seuls.',
      note: dirty ? 'Tes modifications seront d\'abord enregistrées.' : null,
      confirm: 'Lancer le quiz',
      onConfirm: async () => {
        if (dirty && !(await save())) return;
        try {
          await api('POST', `/quizzes/${slug}/launch`);
          await refreshList();
          say('Quiz lancé : nouvelle partie. Ouvre /tv sur la télé et /admin sur ton téléphone.');
        } catch (e) {
          if (e.errors) setErrors(e.errors);
          fail(e);
        }
      },
    });
  };

  const askTitle = (from) =>
    openDialog({
      title: from ? 'Dupliquer ce quiz' : 'Nouveau quiz',
      prompt: from ? `${doc.titre} (copie)` : 'Mon quiz',
      note: from && dirty ? "Tes modifications seront d'abord enregistrées (la copie les reprend)." : null,
      confirm: 'Créer',
      onConfirm: async (titre) => {
        try {
          if (from && dirty && !(await save())) return; // la copie se fait à partir du fichier enregistré
          const res = await api('POST', '/quizzes', { titre, from });
          await refreshList();
          await load(res.slug);
        } catch (e) {
          fail(e);
        }
      },
    });
  const create = (from) => (from ? askTitle(from) : guardDirty(() => askTitle(null)));

  const del = () => {
    openDialog({
      title: `Supprimer « ${doc.titre} » ?`,
      text: 'Le fichier est mis de côté avec l\'extension .bak dans le dossier quizzes/ : tu peux le récupérer à la main.',
      confirm: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        try {
          await api('DELETE', `/quizzes/${slug}`);
          const res = await refreshList();
          const next = res.active ?? res.quizzes[0]?.slug;
          if (next) await load(next);
          else {
            setSlug(null);
            setDoc(null);
          }
          say('Quiz supprimé.');
        } catch (e) {
          fail(e);
        }
      },
    });
  };

  const exportQuiz = () => {
    const used = usedImages(doc);
    openDialog({
      title: 'Exporter ce quiz',
      list: used,
      listTitle: used.length ? 'Le fichier YAML ne contient pas les photos. Pour que le quiz marche ailleurs, copie aussi ces fichiers dans le dossier images/ de l\'autre ordinateur :' : null,
      missing: used.filter((u) => !images.includes(u)),
      note: dirty ? 'Attention : le fichier téléchargé est la dernière version enregistrée. Enregistre d\'abord pour inclure tes modifications.' : null,
      download: `/api/quizzes/${slug}/export`,
    });
  };

  const importQuiz = async (file) => {
    try {
      const res = await api('POST', '/import', await file.text(), { text: true });
      await refreshList();
      await load(res.slug);
      if (res.missing.length) {
        openDialog({
          title: 'Quiz importé',
          list: res.missing,
          listTitle: 'Ces photos sont introuvables sur cet ordinateur. Ajoute-les dans le dossier images/ (même nom) ou choisis-en d\'autres dans l\'éditeur :',
          missing: res.missing,
          close: true,
        });
      } else say('Quiz importé.');
    } catch (e) {
      if (e.errors) setErrors(e.errors);
      fail(e);
    }
  };

  const resetGame = () =>
    openDialog({
      title: 'Réinitialiser la partie ?',
      text: 'Les joueurs et tous les scores sont effacés. Le quiz choisi reste le même.',
      confirm: 'Réinitialiser',
      danger: true,
      onConfirm: () => api('POST', '/reset').then(() => say('Partie réinitialisée.')).catch(fail),
    });

  const stop = () =>
    openDialog({
      title: "Arrêter l'application ?",
      text: 'Les invités seront déconnectés. Pour relancer, utilise le raccourci « Interactive Poll » (ou start-ubuntu.sh).',
      note: dirty ? 'Attention : tu as des modifications non enregistrées, elles seront perdues.' : null,
      confirm: 'Arrêter',
      danger: true,
      onConfirm: () => api('POST', '/stop').then(() => setStopped(true)).catch(fail),
    });

  if (stopped) {
    return (
      <div className="e-app">
        <div className="e-card e-empty">
          <h1>Application arrêtée</h1>
          <p>Tu peux fermer cet onglet. Pour relancer, utilise le raccourci « Interactive Poll » (ou start-ubuntu.sh).</p>
        </div>
      </div>
    );
  }

  const globalErrors = errors.filter((e) => !/^slide \d+ :/.test(e));
  const slideErrors = (i) => errors.filter((e) => e.startsWith(`slide ${i + 1} :`));

  return (
    <Images.Provider value={{ images, upload }}>
      <div className="e-app">
        <header className="e-top">
          <h1>Éditeur de quiz</h1>
          <div className="e-row">
            <a className="e-btn is-small is-ghost" href="/tv" target="_blank" rel="noreferrer">Écran télé ↗</a>
            <a className="e-btn is-small is-ghost" href="/admin" target="_blank" rel="noreferrer">Admin ↗</a>
            <button type="button" className="e-btn is-small is-ghost" onClick={resetGame}>Réinitialiser la partie</button>
            <button type="button" className="e-btn is-small is-danger" onClick={stop}>Arrêter l'application</button>
          </div>
        </header>

        {notice && (
          <div className={`e-notice is-${notice.kind}`} role="status" onClick={() => setNotice(null)}>
            {notice.text}
          </div>
        )}

        <div className="e-layout">
          <aside className="e-side">
            <h2>Mes quiz</h2>
            <ul className="e-quizzes">
              {quizzes.map((q) => (
                <li key={q.slug}>
                  <button type="button" className={`e-quiz${q.slug === slug ? ' is-current' : ''}`} onClick={() => choose(q.slug)}>
                    <strong>{q.slug === slug && doc ? doc.titre : q.titre}</strong>
                    <small>
                      {q.slides} slide{q.slides > 1 ? 's' : ''}
                      {q.errors > 0 && <em className="e-warn"> · à corriger</em>}
                    </small>
                    {q.slug === active && <span className="e-live">en cours de jeu</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="e-btn is-primary" onClick={() => create(null)}>＋ Nouveau quiz</button>
            <input ref={importRef} type="file" accept=".yaml,.yml,text/yaml,text/plain" hidden onChange={(e) => { if (e.target.files[0]) importQuiz(e.target.files[0]); e.target.value = ''; }} />
            <button type="button" className="e-btn is-ghost" onClick={() => guardDirty(() => importRef.current.click())}>Importer un fichier…</button>
          </aside>

          {doc ? (
            <main className="e-main">
              <div className="e-bar">
                <div className="e-bar-status">
                  {dirty ? <span className="e-dirty">● Modifications non enregistrées</span> : <span className="e-clean">✓ Enregistré</span>}
                  {slug === active && <span className="e-live">en cours de jeu</span>}
                </div>
                <div className="e-row">
                  <button type="button" className="e-btn is-primary" disabled={!dirty || errors.length > 0} onClick={save} title={errors.length ? 'Corrige les erreurs avant d\'enregistrer' : ''}>
                    {slug === active ? 'Enregistrer et appliquer' : 'Enregistrer'}
                  </button>
                  <button type="button" className="e-btn is-play" disabled={errors.length > 0} onClick={launch}>▶ Lancer ce quiz</button>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="e-errors" role="alert">
                  <strong>À corriger avant d'enregistrer :</strong>
                  <ul>
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="e-card">
                <h2>Réglages du quiz</h2>
                <div className="e-form">
                  <Field label="Titre du quiz" wide><Text value={doc.titre} onChange={(v) => setField({ titre: v })} /></Field>
                  <Field label="Message sur le podium" hint="Affiché à la fin, sous le classement." wide><Text value={doc.podium_texte} onChange={(v) => setField({ podium_texte: v })} /></Field>
                  <div className="e-field is-wide">
                    <span>Fond d'écran par défaut</span>
                    <ImagePicker value={doc.background} onChange={(v) => setField({ background: v })} />
                  </div>
                </div>
                {globalErrors.length > 0 && <p className="e-error">{globalErrors[0]}</p>}
              </section>

              <section className="e-slides">
                <h2>Slides ({doc.slides.length})</h2>
                {doc.slides.map((s, i) => {
                  const errs = slideErrors(i);
                  const isOpen = openKey === s._k;
                  return (
                    <article key={s._k} className={`e-slide${isOpen ? ' is-open' : ''}${errs.length ? ' has-error' : ''}`}>
                      <div className="e-slide-head">
                        <button type="button" className="e-slide-title" aria-expanded={isOpen} onClick={() => setOpenKey(isOpen ? null : s._k)}>
                          <span className="e-num">{i + 1}</span>
                          <span className="e-type">{TYPES[s.type]?.label ?? s.type}</span>
                          <span className="e-sum">{summary(s)}</span>
                          {errs.length > 0 && <span className="e-warn">⚠</span>}
                        </button>
                        <div className="e-tools">
                          <button type="button" className="e-btn is-small is-ghost" aria-label="Monter" title="Monter" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                          <button type="button" className="e-btn is-small is-ghost" aria-label="Descendre" title="Descendre" disabled={i === doc.slides.length - 1} onClick={() => move(i, 1)}>↓</button>
                          <button type="button" className="e-btn is-small is-ghost" aria-label="Dupliquer" title="Dupliquer" onClick={() => duplicate(i)}>⧉</button>
                          <button type="button" className="e-btn is-small is-ghost" aria-label="Supprimer" title="Supprimer" onClick={() => remove(i)}>✕</button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="e-slide-body">
                          {errs.length > 0 && (
                            <ul className="e-error-list">
                              {errs.map((e) => (
                                <li key={e}>{e.replace(/^slide \d+ : /, '')}</li>
                              ))}
                            </ul>
                          )}
                          <SlideForm slide={s} set={(patch) => setSlide(s._k, patch)} />
                        </div>
                      )}
                    </article>
                  );
                })}

                <div className="e-add">
                  <span>Ajouter une slide :</span>
                  <div className="e-add-grid">
                    {Object.entries(TYPES).map(([type, t]) => (
                      <button key={type} type="button" className="e-add-btn" onClick={() => add(type)}>
                        <strong>＋ {t.label}</strong>
                        <small>{t.hint}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <div className="e-foot">
                <button type="button" className="e-btn is-ghost" onClick={() => create(slug)}>Dupliquer ce quiz</button>
                <button type="button" className="e-btn is-ghost" onClick={exportQuiz}>Exporter (YAML)…</button>
                <button type="button" className="e-btn is-danger" disabled={slug === active} title={slug === active ? 'Quiz en cours de jeu : lance-en un autre avant' : ''} onClick={del}>Supprimer ce quiz</button>
              </div>
            </main>
          ) : (
            <main className="e-main">
              <div className="e-card e-empty">
                <h2>Aucun quiz</h2>
                <p>Crée ton premier quiz avec le bouton « Nouveau quiz ».</p>
              </div>
            </main>
          )}
        </div>

        {dialog && <DialogView key={dialog.id} dialog={dialog} close={() => setDialog(null)} />}
      </div>
    </Images.Provider>
  );
}

function DialogView({ dialog, close }) {
  const [value, setValue] = useState(dialog.prompt ?? '');
  const confirm = () => {
    close();
    dialog.onConfirm?.(value);
  };
  return (
    <Modal
      title={dialog.title}
      onClose={close}
      actions={
        <>
          {dialog.download && (
            <a className="e-btn is-primary" href={dialog.download} download onClick={close}>
              Télécharger le fichier
            </a>
          )}
          {dialog.onConfirm && (
            <button type="button" className={`e-btn ${dialog.danger ? 'is-danger' : 'is-primary'}`} onClick={confirm} disabled={dialog.prompt !== undefined && !value.trim()}>
              {dialog.confirm}
            </button>
          )}
          <button type="button" className="e-btn is-ghost" onClick={close}>
            {dialog.onConfirm ? 'Annuler' : 'Fermer'}
          </button>
        </>
      }
    >
      {dialog.text && <p>{dialog.text}</p>}
      {dialog.prompt !== undefined && (
        <input
          className="e-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && confirm()}
          placeholder="Titre du quiz"
        />
      )}
      {dialog.listTitle && <p>{dialog.listTitle}</p>}
      {dialog.list?.length > 0 && (
        <ul className="e-file-list">
          {dialog.list.map((f) => (
            <li key={f}>
              <code>{f}</code>
              {dialog.missing?.includes(f) && <em className="e-warn"> — introuvable ici</em>}
            </li>
          ))}
        </ul>
      )}
      {dialog.note && <p className="e-note">{dialog.note}</p>}
    </Modal>
  );
}
