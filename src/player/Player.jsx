import { useEffect, useRef, useState } from 'react';
import { formatNumber, quizOptions, socket, useGame } from '../useGame.js';
import { Check, Cross, Shape } from '../Shape.jsx';
import { Dial } from '../Dial.jsx';

const STORAGE_KEY = 'interactive-poll-joueur';

function readIdentity() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeIdentity(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // stockage indisponible (navigation privée) : on reste connecté jusqu'au rechargement
  }
}

// crypto.randomUUID n'existe pas en http sur une IP locale : on fabrique un id simple.
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function Player() {
  const { state, connected } = useGame();
  const [me, setMe] = useState(readIdentity);
  const [error, setError] = useState('');

  useEffect(() => {
    const handle = (res) => {
      if (res?.kicked) {
        writeIdentity(null);
        setMe(null);
        setError('Tu as été retiré de la partie. Tu peux revenir avec un autre prénom.');
      } else if (res?.player) {
        const ident = { id: res.player.id, name: res.player.name };
        writeIdentity(ident);
        setMe(ident);
        setError('');
      } else if (res?.error) {
        setError(res.error);
      }
    };
    // Après une veille du téléphone, socket.io se reconnecte : on se ré-annonce à chaque fois.
    const join = () => {
      const ident = readIdentity();
      if (ident) socket.emit('player:join', ident, handle);
    };
    const kicked = () => handle({ kicked: true });
    socket.on('connect', join);
    socket.on('rejoin', join);
    socket.on('kicked', kicked);
    if (socket.connected) join();
    return () => {
      socket.off('connect', join);
      socket.off('rejoin', join);
      socket.off('kicked', kicked);
    };
  }, []);

  const submit = (name) => {
    const ident = { id: me?.id ?? newId(), name };
    socket.emit('player:join', ident, (res) => {
      if (res?.player) {
        writeIdentity({ id: res.player.id, name: res.player.name });
        setMe({ id: res.player.id, name: res.player.name });
        setError('');
      } else if (res?.kicked) {
        writeIdentity(null);
        setMe(null);
        setError('Tu as été retiré de la partie.');
      } else {
        setError(res?.error ?? 'Oups, réessaie.');
      }
    });
  };

  const player = state?.players.find((p) => p.id === me?.id);
  if (!me) return <Join titre={state?.titre} error={error} onSubmit={submit} />;
  if (!state || !player) {
    return (
      <div className="p-screen p-game">
        <div className="p-center">
          <span className="p-big">Connexion…</span>
        </div>
      </div>
    );
  }

  const slide = state.slides[state.index];
  return (
    <div className="p-screen p-game">
      <div className="p-head">
        <strong>{player.name}</strong>
        <span className="p-score">{formatNumber(player.score)} pts</span>
      </div>
      {!connected && <p className="p-hint">Connexion perdue, reconnexion…</p>}
      {state.index < 0 ? (
        <Waiting title="Tu es dans la partie !" text="Regarde la télé, ça va commencer." />
      ) : !slide ? (
        <Final state={state} player={player} />
      ) : slide.type === 'contenu' ? (
        <Waiting title="Regarde la télé !" text={slide.titre} />
      ) : (
        <>
          <span className="p-kicker">
            Question {state.index + 1} / {state.total}
          </span>
          <h1 className="p-question">{slide.question}</h1>
          {slide.type === 'quiz' && <QuizAnswer key={state.index} slide={slide} current={state.current} me={me} />}
          {slide.type === 'slider' && <SliderAnswer key={state.index} slide={slide} current={state.current} me={me} />}
          {slide.type === 'avis' && <OpinionAnswer key={state.index} slide={slide} current={state.current} me={me} />}
          {slide.type === 'wordcloud' && <CloudAnswer key={state.index} slide={slide} current={state.current} me={me} />}
          {slide.type === 'demicercle' && <HalfCircleAnswer key={state.index} slide={slide} current={state.current} me={me} />}
        </>
      )}
    </div>
  );
}

function Join({ titre, error, onSubmit }) {
  const [name, setName] = useState('');
  return (
    <div className="p-screen p-join">
      <div className="p-sun" aria-hidden="true" />
      <svg className="p-join-deco" viewBox="0 0 390 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 20 C 50 5 100 35 150 20 S 250 5 300 20 S 360 35 390 20 L390 220 L0 220 Z" fill="#1E73BE" />
        <path d="M0 70 C 50 58 100 82 150 70 S 250 58 300 70 S 360 82 390 70 L390 220 L0 220 Z" fill="#FBF8F2" />
      </svg>
      <h1 className="p-logo">
        Quiz
        <br />
        Time!
      </h1>
      {titre && <p className="p-sub">{titre}</p>}
      <form
        className="p-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <label htmlFor="nom">Ton prénom</label>
        <input id="nom" className="p-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="given-name" enterKeyHint="go" />
        {error && <p className="p-error">{error}</p>}
        <button type="submit" className="p-btn" disabled={!name.trim()}>
          Je rejoins la fête
        </button>
      </form>
    </div>
  );
}

function Waiting({ title, text }) {
  return (
    <div className="p-center">
      <span className="p-big">{title}</span>
      {text && <p className="p-hint">{text}</p>}
    </div>
  );
}

function Final({ state, player }) {
  const rank = state.players.findIndex((p) => p.id === player.id) + 1;
  return (
    <div className="p-center">
      <span className="p-big">{rank === 1 ? 'Dancing Queen !' : `${rank}e place`}</span>
      <p className="p-hint">
        Tu termines avec {formatNumber(player.score)} points sur {state.players.length} joueurs.
      </p>
    </div>
  );
}

function Result({ current, me, children }) {
  const pts = current.points[me.id];
  const answered = me.id in current.answers;
  return (
    <div className="p-center">
      <div className={`p-result ${pts > 0 ? 'is-ok' : 'is-ko'}`}>{pts > 0 ? <Check size={64} /> : <Cross size={64} />}</div>
      <span className="p-big">{!answered ? 'Pas de réponse' : pts > 0 ? `+${formatNumber(pts)}` : 'Raté !'}</span>
      {children}
    </div>
  );
}

function QuizAnswer({ slide, current, me }) {
  if (!current) return null;
  const mine = current.answers[me.id];
  if (current.phase === 'revealed') {
    return (
      <Result current={current} me={me}>
        <p className="p-hint">Bonne réponse : {slide.options[current.correct]}</p>
      </Result>
    );
  }
  const open = current.phase === 'open';
  return (
    <>
      <div className="p-options">
        {quizOptions(slide, current).map(({ index, label, style: s }) => {
          const picked = mine === index;
          return (
            <button
              key={index}
              type="button"
              className={`p-option ${mine != null && !picked ? 'is-dim' : ''} ${picked ? 'is-picked' : ''}`}
              style={{ background: s.bg, color: s.fg }}
              aria-pressed={picked}
              disabled={!open}
              onClick={() => socket.emit('player:answer', index)}
            >
              <Shape shape={s.shape} />
              <span>{label}</span>
              {picked && <Check />}
            </button>
          );
        })}
      </div>
      <p className="p-hint">
        {!open ? 'Votes fermés, regarde la télé !' : mine != null ? "Réponse envoyée. Tu peux changer d'avis jusqu'à la fermeture des votes." : 'Choisis ta réponse.'}
      </p>
    </>
  );
}

function SliderAnswer({ slide, current, me }) {
  const mine = current?.answers[me.id];
  const middle = slide.min + Math.round((slide.max - slide.min) / 2 / slide.step) * slide.step;
  const [value, setValue] = useState(mine ?? middle);
  // Brouillon texte du champ numérique : on peut l'effacer pour retaper sans qu'il saute à « min ».
  const [draft, setDraft] = useState(String(mine ?? middle));
  if (!current) return null;
  const clamp = (n) => Math.min(slide.max, Math.max(slide.min, n));
  const pick = (n) => {
    setValue(n);
    setDraft(String(n));
  };
  const commitDraft = () => {
    const n = draft.trim() === '' ? NaN : Number(draft.replace(',', '.'));
    const v = Number.isFinite(n) ? clamp(n) : value;
    pick(v);
    return v;
  };
  const unit = slide.unite ? ` ${slide.unite}` : '';

  if (current.phase === 'revealed') {
    return (
      <Result current={current} me={me}>
        <p className="p-hint">
          Réponse : {formatNumber(current.correct)}
          {unit}
          {mine != null && ` · toi : ${formatNumber(mine)}${unit}`}
        </p>
      </Result>
    );
  }
  const open = current.phase === 'open';
  const sent = mine != null && Number(mine) === Number(value);
  return (
    <>
      <div className="p-center" style={{ alignItems: 'stretch' }}>
        <div className="p-slider-value">
          {formatNumber(value)}
          {unit}
        </div>
        <input
          type="range"
          className="p-range"
          min={slide.min}
          max={slide.max}
          step={slide.step}
          value={value}
          disabled={!open}
          aria-label="Ton estimation"
          onChange={(e) => pick(Number(e.target.value))}
        />
        <div className="p-bounds">
          <span>{formatNumber(slide.min)}</span>
          <span>{formatNumber(slide.max)}</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="p-input p-number"
          value={draft}
          disabled={!open}
          aria-label="Ton estimation (saisie)"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value.trim() !== '' && Number.isFinite(n)) setValue(clamp(n));
          }}
          onBlur={commitDraft}
        />
        <button type="button" className="p-btn" disabled={!open || sent} onClick={() => socket.emit('player:answer', commitDraft())}>
          {sent ? 'Envoyé !' : mine != null ? 'Modifier ma réponse' : 'Valider'}
        </button>
      </div>
      <p className="p-hint">{open ? "Tu peux changer d'avis jusqu'à la fermeture des votes." : 'Votes fermés, regarde la télé !'}</p>
    </>
  );
}

// Avis du public : chaque mouvement du curseur est envoyé (au plus toutes les 150 ms),
// la télé suit la moyenne en direct.
function OpinionAnswer({ slide, current, me }) {
  const mine = current?.answers[me.id];
  const middle = slide.min + Math.round((slide.max - slide.min) / 2 / slide.step) * slide.step;
  const [value, setValue] = useState(mine ?? middle);
  const lastSent = useRef(0);
  const pending = useRef(null);
  useEffect(() => () => clearTimeout(pending.current), []);
  if (!current) return null;
  const open = current.phase === 'open';
  const unit = slide.unite ? ` ${slide.unite}` : '';

  const send = (v) => {
    clearTimeout(pending.current);
    const wait = 150 - (Date.now() - lastSent.current);
    pending.current = setTimeout(() => {
      lastSent.current = Date.now();
      socket.emit('player:answer', v);
    }, Math.max(0, wait));
  };

  return (
    <>
      <div className="p-center" style={{ alignItems: 'stretch' }}>
        <div className="p-slider-value">
          {formatNumber(value)}
          {unit}
        </div>
        <input
          type="range"
          className="p-range"
          min={slide.min}
          max={slide.max}
          step={slide.step}
          value={value}
          disabled={!open}
          aria-label="Ton avis"
          onChange={(e) => {
            setValue(Number(e.target.value));
            send(Number(e.target.value));
          }}
        />
        <div className="p-bounds">
          <span>{slide.gauche || formatNumber(slide.min)}</span>
          <span>{slide.droite || formatNumber(slide.max)}</span>
        </div>
        {open && mine == null && (
          <button type="button" className="p-btn" onClick={() => send(value)}>
            Valider mon avis
          </button>
        )}
      </div>
      <p className="p-hint">
        {!open ? 'Votes fermés, regarde la télé !' : mine != null ? "Ton avis compte ! Bouge le curseur si tu changes d'avis." : 'Bouge le curseur, la télé affiche la moyenne.'}
      </p>
    </>
  );
}

function HalfCircleAnswer({ slide, current, me }) {
  if (!current) return null;
  const revealed = current.phase === 'revealed';
  return (
    <>
      <Dial className="p-dial" target={current.correct} gauche={slide.gauche} droite={slide.droite} />
      {revealed ? (
        <Waiting title="Regarde la télé !" text="La cible est révélée." />
      ) : (
        <>
          <p className="p-hint">Écris un mot qui correspond à l'endroit de la cible. Chut, ne montre pas ton écran !</p>
          <CloudAnswer slide={slide} current={current} me={me} />
        </>
      )}
    </>
  );
}

function CloudAnswer({ slide, current, me }) {
  const [word, setWord] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  if (!current) return null;
  const mine = current.answers[me.id] ?? [];
  const open = current.phase === 'open';
  const limit = slide.max_mots; // null = illimité
  const left = limit == null ? null : Math.max(0, limit - mine.length);
  const full = left === 0;

  const send = (e) => {
    e.preventDefault();
    if (!word.trim()) return;
    socket.emit('player:answer', word, (res) => {
      if (res?.error) {
        setError(res.error);
      } else {
        setWord('');
        setError('');
        inputRef.current?.focus(); // garde le clavier ouvert pour le mot suivant
      }
    });
  };

  return (
    <form className="p-center" style={{ alignItems: 'stretch' }} onSubmit={send}>
      {limit == null ? (
        <p className="p-gauge-text">{mine.length ? `${mine.length} mot${mine.length > 1 ? 's' : ''} envoyé${mine.length > 1 ? 's' : ''}, continue !` : 'Envoie autant de mots que tu veux !'}</p>
      ) : (
        <div className="p-gauge" aria-live="polite">
          {limit <= 10 && (
            <div className="p-gauge-dots" aria-hidden="true">
              {Array.from({ length: limit }, (_, i) => (
                <i key={i} className={i < left ? '' : 'is-used'} />
              ))}
            </div>
          )}
          <p className="p-gauge-text">{full ? 'Tu as utilisé tous tes mots' : `Il te reste ${left} mot${left > 1 ? 's' : ''}`}</p>
        </div>
      )}

      {open && !full && (
        <div className="p-word-row">
          <input
            ref={inputRef}
            className="p-input"
            value={word}
            maxLength={25}
            aria-label="Ton mot"
            placeholder="Ton mot"
            autoComplete="off"
            enterKeyHint="send"
            onChange={(e) => {
              setWord(e.target.value);
              setError('');
            }}
          />
          <button type="submit" className="p-btn" disabled={!word.trim()}>
            Envoyer
          </button>
        </div>
      )}
      {error && <p className="p-hint p-word-error">{error}</p>}

      {mine.length > 0 && (
        <div className="p-sent">
          {mine.map((w, i) => (
            <span key={w} className="p-chip">
              {w}
              {open && (
                <button type="button" aria-label={`Retirer ${w}`} onClick={() => socket.emit('player:answer', { retirer: i })}>
                  <Cross size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <p className="p-hint">{open ? 'Tes mots apparaissent sur la télé.' : 'Votes fermés, merci !'}</p>
    </form>
  );
}
