import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/flowchart/dispatch': {
        target: 'http://127.0.0.1:3001',
        rewrite: () => '/flowchart/dispatch',
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
