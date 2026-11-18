import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre's worker (see src/components/StormMap.tsx) is an ES module
  worker: { format: 'es' },
})
