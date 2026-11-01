export function Shape({ shape, size = 36 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true };
  if (shape === 'wave') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M2 9c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
        <path d="M2 17c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
      </svg>
    );
  }
  if (shape === 'flower') {
    return (
      <svg {...common} fill="currentColor">
        <circle cx="12" cy="5.5" r="4" />
        <circle cx="18.2" cy="10" r="4" />
        <circle cx="15.8" cy="17.3" r="4" />
        <circle cx="8.2" cy="17.3" r="4" />
        <circle cx="5.8" cy="10" r="4" />
      </svg>
    );
  }
  if (shape === 'sun') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor">
      <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3l-5.3-5 7.2-.9z" />
    </svg>
  );
}

export function Check({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function Cross({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
