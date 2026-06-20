import { defineConfig } from 'vite';
import react       from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// @vitejs/plugin-react replaces plugin-react-swc (SWC transform is now built-in)
// @tailwindcss/vite is the recommended Tailwind v4 integration — faster than PostCSS

export default defineConfig({
    // The '@/' alias must be set HERE for Vite to resolve it at dev/build time.
    // The tsconfig "paths" entry only tells the TypeScript checker/editor about it —
    // Vite (the bundler) needs its own alias or imports like '@/store/auth' fail with
    // "Failed to resolve import". Keep this in sync with tsconfig's paths.
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        port: 5173,
        proxy: {
            // Proxy /api/* to the Hono backend during local dev
            // This avoids CORS issues and means you don't need to hardcode the backend URL
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                // SSE connections need these settings to stay open
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq) => {
                        proxyReq.setHeader('Connection', 'keep-alive');
                        proxyReq.setHeader('Cache-Control', 'no-cache');
                    });
                },
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});