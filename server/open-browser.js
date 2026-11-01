import { spawn } from 'node:child_process';

// Ouvre l'adresse dans le navigateur par défaut. Si ça échoue (serveur sans écran…), on se tait : l'adresse est affichée dans la console.
export function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]] // « start » prend le titre de fenêtre en premier : Node met l'argument vide entre guillemets
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignoré
  }
}
