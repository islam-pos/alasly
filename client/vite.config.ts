import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const productionApiUrl = 'https://alasly.top/api';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL
    || (mode === 'mobile' || mode === 'desktop' ? productionApiUrl : undefined);

  return {
    base: mode === 'desktop' ? './' : '/',
    plugins: [
      react(),
      VitePWA({
        disable: mode === 'desktop',
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'المحترف لإدارة مراكز صيانة السيارات',
          short_name: 'المحترف',
          description: 'نظام إدارة مراكز صيانة السيارات وقطع الغيار',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#f8fafc',
          theme_color: '#0369a1',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'نقطة البيع', short_name: 'نقطة البيع', url: '/pos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'المخزون', short_name: 'المخزون', url: '/warehouses', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'أوامر الإصلاح', short_name: 'الورشة', url: '/workshop/job-cards', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    define: apiBaseUrl
      ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl) }
      : {},
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
