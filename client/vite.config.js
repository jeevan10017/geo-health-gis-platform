import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],

    build: {
        // Target modern browsers — smaller bundles, no legacy polyfills
        target: 'es2020',

        rollupOptions: {
            output: {
                // ── Manual chunks ──────────────────────────────────────────────
                // Split vendor libs so users cache them separately from app code.
                // App code changes every deploy; vendor libs rarely change.

                manualChunks: (id) => {
                    // Leaflet + react-leaflet — biggest dep (~450KB raw)
                    if (id.includes('leaflet')) return 'leaflet';

                    // Recharts (used in TradeoffChart)
                    if (id.includes('recharts') || id.includes('d3-')) return 'charts';

                    // React core
                    if (id.includes('node_modules/react') ||
                        id.includes('node_modules/react-dom') ||
                        id.includes('node_modules/react-router')) return 'react-vendor';

                    // Analytics panels — only loaded on demand via lazy()
                    if (id.includes('analytics/BlackspotMap'))      return 'panel-blackspot';
                    if (id.includes('analytics/AdvancedParetoPanel')) return 'panel-pareto';
                    if (id.includes('analytics/SurvivalScorePanel')) return 'panel-survival';
                    if (id.includes('modals/SmsQueryModal'))        return 'panel-sms';

                    // Everything else from node_modules → vendor chunk
                    if (id.includes('node_modules')) return 'vendor';
                },
            },
        },

        // Report chunk sizes — shows what's big
        chunkSizeWarningLimit: 600,
    },

    // Dev server proxy — avoids CORS in local development
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target:       'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
});