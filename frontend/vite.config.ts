import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Vite 4 compiles Sass through Sass's legacy JS API and Sass warns about that on every run (in the build and in every test file
      // that imports a stylesheet); it is the tool's to fix, not the stylesheets'. Other deprecations are still shown.
      scss: { silenceDeprecations: ['legacy-js-api'] },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: kept in files of their own, they stay cached across releases of the app's own code.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('@dnd-kit')) return 'vendor-dnd'
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
