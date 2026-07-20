import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
