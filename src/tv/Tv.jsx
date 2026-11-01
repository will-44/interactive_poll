import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatNumber, quizOptions, useGame } from '../useGame.js';
import { Shape } from '../Shape.jsx';
import { Dial } from '../Dial.jsx';

const W = 1920;
const H = 1080;
const CHIP_COLORS = [
  ['#E0457B', '#FFFFFF'],
  ['#F6C343', '#0B2E52'],
  ['#1E63B5', '#FFFFFF'],
  ['#5B7F1F', '#FFFFFF'],
];
const CLOUD_COLORS = ['#0B4F8A', '#D63A6E', '#5B7F1F', '#1E63B5', '#9A6B00'];

function useFit() {
  const [box, setBox] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      setBox({ scale, left: (window.innerWidth - W * scale) / 2, top: (window.innerHeight - H * scale) / 2 });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return box;
}

export function Tv() {
  const { state, connected } = useGame();
  const { scale, left, top } = useFit();

  let content = null;
  let background = null;
  let tone = '';
  if (state) {
    const slide = state.slides[state.index];
    if (state.index < 0) {
      background = state.background;
      content = <Lobby state={state} decorated={!background} />;
    } else if (!slide) {
      tone = 'is-night';
      content = <Podium players={state.players} texte={state.podium_texte} />;
    } else {
      background = slide.background;
      if (!background && slide.type === 'wordcloud') tone = 'is-cream';
      content = <SlideView key={state.index} state={state} slide={slide} />;
    }
  }

  return (
    <div className="tv-viewport">
      <div
        className={`tv-stage ${tone}`}
        style={{
          transform: `scale(${scale})`,
          left,
          top,
          backgroundImage: background ? `url("${background}")` : undefined,
        }}
      >
        {content}
        {!connected && <div className="tv-offline">Connexion au serveur perdue…</div>}
      </div>
    </div>
  );
}

function SlideView({ state, slide }) {
  const counter = (
    <div className="tv-top">
      <span className="tv-pill">
        {state.index + 1} / {state.total}
      </span>
    </div>
  );
  if (slide.type === 'contenu') return <Content slide={slide} counter={counter} />;
  if (slide.type === 'quiz') return <Quiz state={state} slide={slide} counter={counter} />;
  if (slide.type === 'slider') return <Slider state={state} slide={slide} counter={counter} />;
  if (slide.type === 'avis') return <Opinion state={state} slide={slide} counter={counter} />;
  if (slide.type === 'demicercle') return <HalfCircle state={state} slide={slide} counter={counter} />;
  return <Cloud state={state} slide={slide} counter={counter} />;
}

function Cadre({ cadre }) {
  if (cadre?.image) {
    return (
      <div className="tv-polaroid">
        <img src={cadre.image} alt="" />
      </div>
    );
  }
  if (cadre?.texte) return <div className="tv-note">{cadre.texte}</div>;
  return null;
}

function Status({ current, players }) {
  if (!current) return null;
  if (current.phase === 'open') {
    return (
      <span className="tv-pill is-sun">
        {current.answered} / {players.length} ont répondu
      </span>
    );
  }
  if (current.phase === 'closed') return <span className="tv-pill is-pink">Votes fermés</span>;
  return null;
}

// --- Accueil -----------------------------------------------------------------

function Lobby({ state, decorated }) {
  return (
    <>
      {decorated && <SeaDecor />}
      <div className="tv-fill tv-lobby-hero">
        <div className="tv-lobby-title">
          <span className="tv-kicker">Bienvenue à la fête</span>
          <h1 className="tv-logo">
            Quiz
            <br />
            Time!
          </h1>
          <p className="tv-subtitle">{state.titre}</p>
        </div>
        <div className="tv-join-card">
          <strong>Rejoins la partie !</strong>
          <div className="tv-qr" dangerouslySetInnerHTML={{ __html: state.qr }} />
          <small>ou tape l'adresse</small>
          <span className="tv-join-url">{state.joinUrl.replace(/^http:\/\//, '')}</span>
        </div>
      </div>
      <div className="tv-lobby-players">
        <header>
          Ils sont là <span className="tv-count">{state.players.length}</span>
        </header>
        <div className="tv-chips">
          {state.players.map((p, i) => {
            const [bg, fg] = CHIP_COLORS[i % CHIP_COLORS.length];
            return (
              <span key={p.id} className="tv-chip" style={{ background: bg, color: fg }}>
                {p.name}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SeaDecor() {
  return (
    <svg className="tv-fill" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <circle cx="1720" cy="150" r="110" fill="#F6C343" />
      <path d="M0 900 C 160 860 320 940 480 900 S 800 860 960 900 S 1280 940 1440 900 S 1760 860 1920 900 L1920 1080 L0 1080 Z" fill="#1E73BE" />
      <path d="M0 960 C 160 930 320 990 480 960 S 800 930 960 960 S 1280 990 1440 960 S 1760 930 1920 960 L1920 1080 L0 1080 Z" fill="#FBF8F2" />
    </svg>
  );
}

// --- Contenu -------------------------------------------------------------------

function Content({ slide, counter }) {
  const hasText = slide.titre || slide.texte;
  return (
    <div className="tv-page">
      {counter}
      <div className="tv-content-center">
        {hasText && (
          <div className="tv-content-card" style={{ maxWidth: slide.cadre ? 1000 : 1500 }}>
            {slide.titre && <h1>{slide.titre}</h1>}
            {slide.texte && <p>{slide.texte}</p>}
          </div>
        )}
        <Cadre cadre={slide.cadre} />
      </div>
    </div>
  );
}

// --- Quiz ----------------------------------------------------------------------

function Quiz({ state, slide, counter }) {
  const current = state.current;
  const revealed = current?.phase === 'revealed';
  const votes = slide.options.map(() => 0);
  for (const v of Object.values(current?.answers ?? {})) votes[v]++;

  return (
    <div className="tv-page">
      {counter}
      <div className="tv-question">{slide.question}</div>
      <div className="tv-body">
        {slide.cadre && (
          <div className="tv-side">
            <Cadre cadre={slide.cadre} />
          </div>
        )}
        <div className="tv-options">
          {quizOptions(slide, current).map(({ index, label, style: s }) => {
            const correct = revealed && current.correct === index;
            return (
              <div
                key={index}
                className={`tv-option ${revealed ? (correct ? 'is-correct' : 'is-faded') : ''}`}
                style={{ background: s.bg, color: s.fg }}
              >
                <Shape shape={s.shape} size={72} />
                <span>{label}</span>
                {revealed && <b>{votes[index]}</b>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="tv-bottom">
        {revealed ? (
          <span className="tv-pill">Bonne réponse : {slide.options[current.correct]}</span>
        ) : (
          <Status current={current} players={state.players} />
        )}
      </div>
    </div>
  );
}

// --- Slider --------------------------------------------------------------------

function Slider({ state, slide, counter }) {
  const current = state.current;
  const revealed = current?.phase === 'revealed';
  const unit = slide.unite ? ` ${slide.unite}` : '';
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - slide.min) / (slide.max - slide.min)) * 100))}%`;
  const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const guesses = Object.entries(current?.answers ?? {}).filter(([pid]) => names[pid]);
  const closest = revealed
    ? [...guesses].sort((a, b) => Math.abs(a[1] - current.correct) - Math.abs(b[1] - current.correct)).slice(0, 3)
    : [];

  return (
    <div className="tv-page">
      {counter}
      <div className="tv-question">{slide.question}</div>
      <div className="tv-body">
        {slide.cadre && (
          <div className="tv-side">
            <Cadre cadre={slide.cadre} />
          </div>
        )}
        <div className="tv-main">
          <div className="tv-range">
            {revealed ? (
              <div className="tv-ruler">
                <div className="tv-ruler-line" />
                {guesses.map(([pid, v]) => (
                  <div key={pid} className="tv-ruler-guess" style={{ left: pos(v) }} />
                ))}
                <div className="tv-ruler-answer" style={{ left: pos(current.correct) }}>
                  <strong>
                    {formatNumber(current.correct)}
                    {unit}
                  </strong>
                  <i />
                </div>
              </div>
            ) : (
              <div className="tv-slider-wait">À vos estimations !</div>
            )}
            <div className="tv-range-bounds">
              <span>
                {formatNumber(slide.min)}
                {unit}
              </span>
              <span>
                {formatNumber(slide.max)}
                {unit}
              </span>
            </div>
            {revealed && closest.length > 0 && (
              <div className="tv-closest">
                {closest.map(([pid, v]) => (
                  <span key={pid}>
                    {names[pid]} · {formatNumber(v)}
                    {unit}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="tv-bottom">
        <Status current={current} players={state.players} />
      </div>
    </div>
  );
}

// --- Avis du public ------------------------------------------------------------

function Opinion({ state, slide, counter }) {
  const current = state.current;
  const unit = slide.unite ? ` ${slide.unite}` : '';
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - slide.min) / (slide.max - slide.min)) * 100))}%`;
  const ids = new Set(state.players.map((p) => p.id));
  const votes = Object.entries(current?.answers ?? {})
    .filter(([pid]) => ids.has(pid))
    .map(([, v]) => v);
  const average = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;

  return (
    <div className="tv-page">
      {counter}
      <div className="tv-question">{slide.question}</div>
      <div className="tv-body">
        {slide.cadre && (
          <div className="tv-side">
            <Cadre cadre={slide.cadre} />
          </div>
        )}
        <div className="tv-main">
          <div className="tv-range">
            {(slide.gauche || slide.droite) && (
              <div className="tv-avis-labels">
                <span>{slide.gauche}</span>
                <span>{slide.droite}</span>
              </div>
            )}
            <div className="tv-avis">
              <div className="tv-avis-track" />
              {votes.map((v, i) => (
                <div key={i} className="tv-avis-vote" style={{ left: pos(v) }} />
              ))}
              {/* Le curseur glisse vers la moyenne à chaque nouvel avis. */}
              <div className={`tv-avis-cursor ${average == null ? 'is-empty' : ''}`} style={{ left: pos(average ?? (slide.min + slide.max) / 2) }}>
                <strong>
                  {average == null ? '?' : formatNumber(Math.round(average * 10) / 10)}
                  {average != null && unit}
                </strong>
                <i />
              </div>
            </div>
            <div className="tv-range-bounds">
              <span>
                {formatNumber(slide.min)}
                {unit}
              </span>
              <span>
                {formatNumber(slide.max)}
                {unit}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="tv-bottom">
        <Status current={current} players={state.players} />
      </div>
    </div>
  );
}

// --- Nuage de mots -------------------------------------------------------------

// Un mot n'atteint la taille maxi qu'à partir de ce nombre de réponses identiques :
// au début (tous les mots à 1), ils restent de taille moyenne.
const FULL_SIZE_COUNT = 3;

function CloudWords({ cloud, minSize = 36, maxSize = 140, className = '' }) {
  const ref = useRef(null);
  const sorted = (cloud ?? []).slice(0, 60); // déjà trié du plus fréquent au moins fréquent
  const max = Math.max(sorted[0]?.count ?? 1, FULL_SIZE_COUNT);

  // Les plus gros au milieu, les petits de part et d'autre.
  const words = [];
  sorted.forEach((w, rank) => {
    const item = { ...w, rank };
    if (rank % 2 === 0) words.push(item);
    else words.unshift(item);
  });

  // Réduit toutes les tailles d'un même facteur tant que le nuage déborde de son cadre.
  const signature = sorted.map((w) => `${w.text}:${w.count}`).join('|');
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let scale = 1;
    el.style.setProperty('--cloud-scale', scale);
    while (scale > 0.3 && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
      scale *= 0.9;
      el.style.setProperty('--cloud-scale', scale);
    }
  }, [signature, fontsReady]);

  return (
    <div ref={ref} className={`tv-cloud ${className}`}>
      {words.length === 0 && <span className="tv-cloud-empty">Les mots vont apparaître ici…</span>}
      {words.map((w) => {
        const weight = w.count / max;
        const display = w.count > 1 && weight >= 0.6;
        return (
          <span
            key={w.text}
            className="tv-word"
            style={{
              fontSize: `calc(var(--cloud-scale, 1) * ${Math.round(minSize + (maxSize - minSize) * weight)}px)`,
              color: CLOUD_COLORS[w.rank % CLOUD_COLORS.length],
              fontFamily: display ? 'var(--display)' : undefined,
              fontWeight: display ? 400 : undefined,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

function WordsStatus({ state }) {
  const current = state.current;
  if (current?.phase === 'closed') return <span className="tv-pill is-pink">Votes fermés</span>;
  if (current?.phase === 'revealed') return null;
  const total = (current?.cloud ?? []).reduce((n, w) => n + w.count, 0);
  return (
    <span className="tv-pill is-sun">
      {total} mots · {current?.answered ?? 0} / {state.players.length} joueurs
    </span>
  );
}

function Cloud({ state, slide, counter }) {
  return (
    <div className="tv-page">
      {counter}
      <div className="tv-question">{slide.question}</div>
      <CloudWords cloud={state.current?.cloud} />
      <div className="tv-bottom">
        <WordsStatus state={state} />
      </div>
    </div>
  );
}

// --- Jeu du demi-cercle --------------------------------------------------------

function HalfCircle({ state, slide, counter }) {
  const current = state.current;
  const revealed = current?.phase === 'revealed';
  return (
    <div className="tv-page">
      {counter}
      <div className="tv-question">{slide.question}</div>
      <div className="tv-body">
        <Dial className="tv-dial" target={revealed ? current.correct : null} gauche={slide.gauche} droite={slide.droite} animate />
        <CloudWords cloud={current?.cloud} minSize={30} maxSize={96} />
      </div>
      <div className="tv-bottom">
        {revealed ? <span className="tv-pill is-sun">La cible était là !</span> : <WordsStatus state={state} />}
      </div>
    </div>
  );
}

// --- Podium --------------------------------------------------------------------

const STEPS = [
  { rank: 2, height: 300, bg: '#D63A6E', fg: '#FFFFFF', size: 52 },
  { rank: 1, height: 420, bg: '#F6C343', fg: '#0B2E52', size: 64 },
  { rank: 3, height: 220, bg: '#1E73BE', fg: '#FFFFFF', size: 48 },
];

function Podium({ players, texte }) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * W,
        w: 12 + Math.random() * 12,
        h: 8 + Math.random() * 8,
        color: ['#F6C343', '#E0457B', '#FBF8F2', '#1E73BE', '#5B7F1F'][i % 5],
        duration: 4 + Math.random() * 5,
        delay: -Math.random() * 9,
      })),
    [],
  );

  return (
    <>
      {confetti.map((c, i) => (
        <div
          key={i}
          className="tv-confetti"
          aria-hidden="true"
          style={{ left: c.left, width: c.w, height: c.h, background: c.color, animationDuration: `${c.duration}s`, animationDelay: `${c.delay}s` }}
        />
      ))}
      <div className="tv-disco" aria-hidden="true" />
      <div className="tv-page tv-podium-page">
        <h1 className="tv-podium-title">Le podium</h1>
        {texte && <span className="tv-podium-sub">{texte}</span>}
        <div className="tv-podium">
          {STEPS.map((s, i) => {
            const p = players[s.rank - 1];
            if (!p) return null;
            return (
              <div key={s.rank} className="tv-step">
                <span className="tv-step-name" style={{ fontSize: s.size }}>
                  {p.name}
                </span>
                <span className="tv-step-points">{formatNumber(p.score)} pts</span>
                <div className="tv-step-block" style={{ height: s.height, background: s.bg, color: s.fg, animationDelay: `${[0.6, 1.2, 0][i]}s` }}>
                  {s.rank}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
