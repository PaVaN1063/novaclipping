import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend target for the dev proxy. Defaults to the docker-compose service
// name; set VITE_PROXY_TARGET=http://localhost:8000 to run the dev server on
// the host against a backend reachable at localhost (no CORS, same-origin).
const backend = process.env.VITE_PROXY_TARGET || 'http://backend:8000'
const renderer = process.env.VITE_RENDER_TARGET || 'http://renderer:3100'

// https://vitejs.dev/config/
export default defineConfig({
  // Nova Clipping: the upstream SEO plugin (OpenShorts marketing pages, free
  // tools, sitemap) is switched off. vite-plugin-seo.js is left in the repo.
  plugins: [react()],
  // The free tools (/youtube-transcript-generator and friends) are static
  // pages emitted by seo(); their behaviour ships as small standalone entries
  // with no React in them. vite-plugin-seo.js finds each entry's hashed file
  // name in the bundle and adds the <script> to its page.
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    // Any host: the site is reached through a Cloudflare Tunnel and sits
    // behind Cloudflare Access, so the login lives there.
    allowedHosts: true,
    // Nova Clipping: Docker on Windows doesn't pass file-change events into the
    // container, so poll for edits; otherwise changes need a container restart.
    watch: { usePolling: true, interval: 800 },
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/videos': { target: backend, changeOrigin: true },
      '/thumbnails': { target: backend, changeOrigin: true },
      '/gallery': { target: backend, changeOrigin: true },
      '/video': { target: backend, changeOrigin: true },
      '/render': { target: renderer, changeOrigin: true },
    }
  }
})
