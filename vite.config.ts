import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre's worker (see src/components/StormMap.tsx) is an ES module
  worker: { format: 'es' },
  // npm test: tests/, in Node (the data tests read public/data from disk; see tests/files.ts)
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60_000 },
})
