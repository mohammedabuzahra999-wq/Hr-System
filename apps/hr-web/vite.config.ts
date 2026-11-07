import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@hr/shared': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
    },
  },
  server: {
    /**
     * The API is proxied under the same origin as the app.
     *
     * That keeps the session cookie first-party in development, so it behaves
     * exactly as it will behind one domain in production — no CORS exceptions to
     * maintain, and no SameSite surprises that only appear after deploying.
     */
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // Server-sent events must not be buffered by the proxy.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    },
  },
})
