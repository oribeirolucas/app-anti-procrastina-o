import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento o Vite repassa a API para o servidor Node (mesma origem → cookie funciona)
    proxy: { '/trpc': 'http://localhost:3000', '/webhooks': 'http://localhost:3000', '/saude': 'http://localhost:3000' },
  },
})
