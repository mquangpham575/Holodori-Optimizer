import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      // Card art is served by the backend (Postgres in prod, portrait fallback
      // for cards without artwork yet); the dev server would otherwise 404 here.
      '/images/cards': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
