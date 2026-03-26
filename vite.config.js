import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project URLs include a sub-path, so use relative asset paths.
  base: './',
  plugins: [react()],
})
