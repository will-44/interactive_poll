import os from 'node:os';

// Interfaces virtuelles (Docker, VPN, VM…) dont l'IP n'est pas joignable depuis les téléphones.
const VIRTUAL = /^(docker|br-|veth|virbr|vboxnet|vmnet|tun|tap|wg|zt|tailscale|lo(\d|$)|vethernet|virtualbox|vmware|loopback|bluetooth)/i;

function rank(name, address) {
  let score = 0;
  if (/^(wl|wlan|wlp|wi-?fi)/i.test(name)) score += 4; // le Wi-Fi d'abord
  else if (/^(en|eth)/i.test(name)) score += 3;
  if (address.startsWith('192.168.')) score += 2;
  else if (address.startsWith('10.')) score += 1;
  return score;
}

export function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      found.push({ name, address: a.address, virtual: VIRTUAL.test(name), score: rank(name, a.address) });
    }
  }
  return found.sort((a, b) => a.virtual - b.virtual || b.score - a.score);
}

export function pickHostIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const best = lanAddresses().find((a) => !a.virtual);
  return best?.address ?? 'localhost';
}
