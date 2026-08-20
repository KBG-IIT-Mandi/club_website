import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Workspace scratch directories may contain tests from unrelated repos.
    // Only this application's source tree belongs to its Vitest suite.
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
  build: {
    // CLOSED SOURCE: dist/ is published to a public deploy repo and served
    // publicly — a .map file would ship the entire original source with it.
    // scripts/publishRelease.sh additionally hard-fails on any map output.
    sourcemap: false,
  },
  server: {
    // listen on all addresses, allow access from LAN
    // Use `true` so Vite will listen on all interfaces and provide
    // a reachable client URL. Avoid using '0.0.0.0' for HMR client.
    host: true,
    port: 5173,
    strictPort: false,
    // Let Vite infer a proper HMR host for the client (browser).
    // If you need to pin HMR to a specific reachable IP (for remote devices),
    // set `hmr.host` to that IP or the proxy host.
    hmr: {
      protocol: 'ws'
    }
  },
})
