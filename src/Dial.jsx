// Demi-cercle : position 0 (tout à gauche) → 100 (tout à droite).
const CX = 100;
const CY = 100;
const R = 92;

function point(pos, r = R) {
  const a = Math.PI - (pos / 100) * Math.PI;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function wedge(pos, half) {
  const from = Math.max(0, pos - half);
  const to = Math.min(100, pos + half);
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${CX} ${CY} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z`;
}

// Zones de la cible, de la plus large à la plus précise (en points de 0 à 100).
const BANDS = [
  { half: 12, color: '#F6C343' },
  { half: 7, color: '#E0457B' },
  { half: 2.5, color: '#0B4F8A' },
];

export function Dial({ target, gauche, droite, animate = false, className = '' }) {
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  return (
    <div className={`dial ${className}`}>
      <svg viewBox="0 0 200 104" role="img" aria-label={target == null ? 'Demi-cercle' : `Demi-cercle, cible à ${target} sur 100`}>
        <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY} Z`} fill="#FBF8F2" stroke="#0B2E52" strokeWidth="2.5" strokeLinejoin="round" />
        {target != null && (
          <g className={animate ? 'dial-reveal' : undefined}>
            {BANDS.map((b) => (
              <path key={b.half} d={wedge(target, b.half)} fill={b.color} />
            ))}
          </g>
        )}
        {ticks.map((t) => {
          const [x1, y1] = point(t, R - 6);
          const [x2, y2] = point(t, R - 1);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0B2E52" strokeWidth="1.2" opacity="0.5" />;
        })}
        <circle cx={CX} cy={CY} r="5" fill="#0B2E52" />
      </svg>
      <div className="dial-labels">
        <span>{gauche}</span>
        <span>{droite}</span>
      </div>
    </div>
  );
}
