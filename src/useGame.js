import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const socket = io();

export function useGame() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onState = (s) => setState(s);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { state, connected };
}

export function emit(event, arg) {
  return new Promise((resolve) => socket.emit(event, arg, resolve));
}

export const OPTION_STYLES = [
  { bg: '#1E63B5', fg: '#FFFFFF', shape: 'wave' },
  { bg: '#D63A6E', fg: '#FFFFFF', shape: 'flower' },
  { bg: '#F2B90C', fg: '#1A2A44', shape: 'sun' },
  { bg: '#5B7F1F', fg: '#FFFFFF', shape: 'star' },
];

// Pas d'espace des milliers sous 10 000 : une année doit rester « 1984 », pas « 1 984 ».
export function formatNumber(n) {
  const v = Number(n);
  return v.toLocaleString('fr-FR', { useGrouping: Math.abs(v) >= 10000 });
}

// Options d'un quiz dans l'ordre d'affichage : [{ index (dans le YAML), label, style }].
// La couleur/forme suit la position à l'écran, pas l'option.
export function quizOptions(slide, current) {
  const order = current?.order ?? slide.options.map((_, i) => i);
  return order.map((index, pos) => ({ index, label: slide.options[index], style: OPTION_STYLES[pos] }));
}
