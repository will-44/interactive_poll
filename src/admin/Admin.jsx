import { useState } from 'react';
import { emit, formatNumber, quizOptions, useGame } from '../useGame.js';
import { Cross } from '../Shape.jsx';
import { Dial } from '../Dial.jsx';

const TYPE_LABELS = { contenu: 'Contenu', quiz: 'Quiz', slider: 'Slider', avis: 'Avis du public', wordcloud: 'Nuage de mots', demicercle: 'Demi-cercle' };
const PHASE_LABELS = { open: 'Votes ouverts', closed: 'Votes fermés', revealed: 'Réponse révélée' };

export function Admin() {
  const { state, connected } = useGame();
  const [reloadMsg, setReloadMsg] = useState('');
  const [warnAt, setWarnAt] = useState(null);

  if (!state) {
    return (
      <div className="a-screen">
        <p>Connexion au serveur…</p>
      </div>
    );
  }

  const slide = state.slides[state.index];
  const where = state.index < 0 ? 'Accueil' : !slide ? 'Podium' : `Slide ${state.index + 1} / ${state.total} · ${TYPE_LABELS[slide.type]}`;

  const reload = async () => {
    const res = await emit('admin:reload');
    setReloadMsg(res?.errors?.length ? '' : `YAML rechargé : ${new Date().toLocaleTimeString('fr-FR')}`);
  };
  // Quiz et slider donnent leurs points à la révélation : on prévient avant de les sauter.
  // warnAt = index de la slide pour laquelle l'avertissement est affiché (null = aucun).
  const next = () => {
    const unrevealed = (slide?.type === 'quiz' || slide?.type === 'slider') && state.current?.phase !== 'revealed';
    if (unrevealed) setWarnAt(state.index);
    else emit('admin:next');
  };
  const reset = () => {
    if (window.confirm('Remettre la partie à zéro ? Les joueurs et tous les scores seront effacés.')) emit('admin:reset');
  };

  return (
    <div className="a-screen">
      <div className="a-head">
        <h1>Admin</h1>
        <span>{connected ? where : 'Déconnecté…'}</span>
      </div>

      {state.errors.length > 0 && (
        <div className="a-errors" role="alert">
          Le quiz contient des erreurs, l'ancienne version reste active :
          <ul>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Current state={state} slide={slide} />

      <div className="a-grid">
        <button type="button" className="a-btn is-ghost" disabled={state.index < 0} onClick={() => emit('admin:prev')}>
          Précédente
        </button>
        <button type="button" className="a-btn" disabled={state.index >= state.total} onClick={next}>
          {state.index < 0
            ? 'Commencer'
            : slide?.type === 'demicercle' && state.current?.phase !== 'revealed'
              ? 'Révéler la cible'
              : state.index === state.total - 1
                ? 'Podium'
                : 'Suivante'}
        </button>
      </div>

      <span className="a-label">Joueurs · {state.players.length}</span>
      <div className="a-players">
        {state.players.map((p) => (
          <span key={p.id} className="a-player">
            {p.name}
            <em>{formatNumber(p.score)}</em>
            <button
              type="button"
              aria-label={`Retirer ${p.name}`}
              onClick={() => window.confirm(`Retirer ${p.name} de la partie ?`) && emit('admin:kick', p.id)}
            >
              <Cross size={14} />
            </button>
          </span>
        ))}
      </div>

      <div className="a-spacer" />
      <p className="a-link">
        Télé : <a href="/tv">{state.joinUrl}/tv</a>
        <br />
        Invités : {state.joinUrl}
        {reloadMsg && (
          <>
            <br />
            {reloadMsg}
          </>
        )}
      </p>
      <div className="a-grid">
        <button type="button" className="a-btn is-ghost" onClick={reload}>
          Recharger le YAML
        </button>
        <button type="button" className="a-btn is-danger" onClick={reset}>
          Réinitialiser
        </button>
      </div>
      {warnAt === state.index && (
        <div className="a-modal" role="alertdialog" aria-modal="true" aria-labelledby="a-warn-title">
          <div className="a-modal-box">
            <strong id="a-warn-title">Vous n'avez pas validé la réponse</strong>
            <span>Si vous continuez, personne ne gagnera de points pour cette question.</span>
            <div className="a-grid">
              <button
                type="button"
                className="a-btn is-ghost"
                onClick={() => {
                  setWarnAt(null);
                  emit('admin:next');
                }}
              >
                Confirmer
              </button>
              <button type="button" className="a-btn is-primary" autoFocus onClick={() => setWarnAt(null)}>
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Current({ state, slide }) {
  if (state.index < 0) {
    return (
      <div className="a-card">
        <strong>Écran d'accueil</strong>
        <span>Les invités scannent le QR code sur la télé. Appuie sur « Commencer » quand tout le monde est là.</span>
      </div>
    );
  }
  if (!slide) {
    return (
      <div className="a-card">
        <strong>Podium final</strong>
        <span>C'est la fin, bravo !</span>
      </div>
    );
  }
  if (slide.type === 'contenu') {
    return (
      <div className="a-card">
        <strong>{slide.titre || 'Slide de contenu'}</strong>
        {slide.texte && <span>{slide.texte}</span>}
      </div>
    );
  }

  const current = state.current;
  const phase = current?.phase ?? 'open';
  return (
    <>
      <div className="a-card">
        <strong>{slide.question}</strong>
        <span className={`a-badge ${phase === 'closed' ? 'is-closed' : phase === 'revealed' ? 'is-revealed' : ''}`}>
          {PHASE_LABELS[phase]} · {current?.answered ?? 0} / {state.players.length}
        </span>
        {slide.type === 'demicercle' && current && <Dial target={current.correct} gauche={slide.gauche} droite={slide.droite} />}
        {slide.type === 'avis' && current?.answered > 0 && (
          <span>
            Moyenne : {formatNumber(Math.round((Object.values(current.answers).reduce((a, b) => a + b, 0) / current.answered) * 10) / 10)}
            {slide.unite ? ` ${slide.unite}` : ''}
          </span>
        )}
      </div>
      {phase === 'open' && (
        <button type="button" className="a-btn is-primary" onClick={() => emit('admin:close')}>
          Fermer les votes
        </button>
      )}
      {slide.type === 'quiz' && <QuizControls slide={slide} current={current} />}
      {slide.type === 'slider' && <SliderControls key={state.index} slide={slide} current={current} />}
    </>
  );
}

function QuizControls({ slide, current }) {
  if (!current) return null;
  const votes = slide.options.map(() => 0);
  for (const v of Object.values(current.answers)) votes[v]++;
  // Votes fermés : on peut toujours choisir (ou corriger) la bonne réponse avant de révéler.
  const choosing = current.phase === 'closed';

  return (
    <>
      {choosing && (
        <span className="a-label">{slide.answer == null ? 'Pas de réponse dans le YAML : choisis la bonne' : 'Bonne réponse (modifiable avant de révéler)'}</span>
      )}
      <div className="a-grid">
        {quizOptions(slide, current).map(({ index, label, style: s }) => {
          return (
            <button
              key={index}
              type="button"
              className={`a-btn a-option ${current.correct === index ? 'is-picked' : ''}`}
              style={{ background: s.bg, color: s.fg }}
              disabled={!choosing}
              aria-pressed={current.correct === index}
              onClick={() => emit('admin:correct', index)}
            >
              {label} · {votes[index]}
            </button>
          );
        })}
      </div>
      {current.phase === 'closed' && (
        <button type="button" className="a-btn is-primary" disabled={current.correct == null} onClick={() => emit('admin:reveal')}>
          {current.correct == null ? 'Choisis la bonne réponse' : `Révéler « ${slide.options[current.correct]} »`}
        </button>
      )}
    </>
  );
}

function SliderControls({ slide, current }) {
  const [value, setValue] = useState(current?.correct ?? '');
  if (!current) return null;
  const unit = slide.unite ? ` ${slide.unite}` : '';
  const choosing = current.phase === 'closed';

  return (
    <>
      {choosing && (
        <>
          <span className="a-label">{slide.answer == null ? 'Pas de réponse dans le YAML : saisis la bonne valeur' : 'Corriger la bonne valeur (facultatif)'}</span>
          <form
            className="a-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (value !== '') emit('admin:correct', Number(value));
            }}
          >
            <input
              type="number"
              inputMode="decimal"
              className="p-input"
              value={value}
              aria-label="Bonne valeur"
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="a-btn">
              Valider
            </button>
          </form>
        </>
      )}
      {current.correct != null && (
        <span className="a-label">
          Bonne réponse : {formatNumber(current.correct)}
          {unit}
        </span>
      )}
      {current.phase === 'closed' && (
        <button type="button" className="a-btn is-primary" disabled={current.correct == null} onClick={() => emit('admin:reveal')}>
          {current.correct == null ? 'Saisis la bonne valeur' : 'Révéler'}
        </button>
      )}
    </>
  );
}
