import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sri from 'vite-plugin-sri'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), sri()],
})
