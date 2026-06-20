import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // strictPort: Electron's dev mode loads http://localhost:5173 directly, so
    // Vite must stay on 5173. Without this it silently drifts to 5174+ when the
    // port is taken and Electron ends up loading whatever else is on 5173.
    port: 5173,
    strictPort: true,
  },
})
