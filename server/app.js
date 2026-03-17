
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const apiRoutes = require('./src/routes/api');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Accept:
//  • any *.vercel.app subdomain (covers both frontend & backend previews)
//  • localhost for local dev

app.use(cors({
    origin: (origin, callback) => {
        // No origin = server-to-server / curl / Postman — allow
        if (!origin) return callback(null, true);

        const allowed =
            origin.endsWith('.vercel.app') ||      // all Vercel deployments
            origin === 'http://localhost:5173' ||
            origin === 'http://localhost:3000' ||
            origin === 'http://localhost:4000';

        if (allowed) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked: ${origin}`);
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Pre-flight OPTIONS handled automatically by cors()
app.options('*', cors());

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        status:   'ok',
        db_host:  process.env.DB_HOST || 'not set',
        ors_key:  process.env.ORS_API_KEY ? 'set' : 'missing',
        env:      process.env.NODE_ENV || 'development',
    });
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
});

// ─── Start (local dev only — Vercel ignores this) ────────────────────────────

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`   DB: ${process.env.DB_HOST}/${process.env.DB_DATABASE}`);
        console.log(`   ORS: ${process.env.ORS_API_KEY ? '✓' : '✗ missing'}`);
    });
}

module.exports = app;