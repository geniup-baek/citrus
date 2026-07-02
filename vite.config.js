import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function getBuildVersion() {
  try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
    const [major, minor] = pkg.version.split('.')
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
    return `${major}.${minor}.${count}`
  } catch {
    return '0.0.0'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getBuildVersion()),
  },
  base: './',
  server: {
    proxy: {
      '/ncpms-api': {
        target: 'http://ncpms.rda.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ncpms-api/, ''),
      },
      '/agri-api': {
        target: 'http://psis.rda.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agri-api/, ''),
      },
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Citrus Operations Hub',
        short_name: 'CitrusHub',
        description: 'Collaborative citrus farm planning and issue management app.',
        theme_color: '#f08a24',
        background_color: '#f7f2e6',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
