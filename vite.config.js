import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pokeumTarget = process.env.POKEUM_PROXY_TARGET
  || `http://127.0.0.1:${process.env.POKEUM_PORT || '8000'}`

export default defineConfig({
  // Chemins relatifs : le build marche à la racine d'un domaine comme dans un sous-dossier (GitHub Pages…)
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/pokeum': {
        target: pokeumTarget,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/pokeum/, ''),
      },
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Classeur Pokémon TCG',
        short_name: 'Classeur TCG',
        description: 'Parcourez toutes les cartes Pokémon par série et par extension.',
        lang: 'fr',
        theme_color: '#176B45',
        background_color: '#F7FAF8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Données de l'API : on affiche le cache tout de suite et on rafraîchit en arrière-plan
            urlPattern: /^https:\/\/api\.tcgdex\.net\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tcgdex-api',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Images des cartes et logos : jamais redemandées une fois en cache
            urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tcgdex-images',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
