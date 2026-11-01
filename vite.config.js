import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev (npm run dev), Vite sert l'interface et relaie le temps réel et les images au serveur Node.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/images': 'http://localhost:3000',
    },
  },
});
