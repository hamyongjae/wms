import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // '@/...' → 'src/...' 로 매핑 (깔끔한 임포트)
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,   // 0.0.0.0 바인딩 → 같은 Wi-Fi의 모바일 기기에서 접속 가능
    port: 5173,
  },
})
