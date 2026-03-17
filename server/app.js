
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const apiRoutes = require('./src/routes/api');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow ALL *.vercel.app origins (covers both frontend & backend Vercel URLs)

app.use(cors({
    origin: true,           // reflect the request origin — allows any origin
    credentials: true,
    methods:        ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());   // handle pre-flight for every route

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        status:  'ok',
        db_host: process.env.DB_HOST || 'not set',
        ors_key: process.env.ORS_API_KEY ? 'set' : 'missing',
        env:     process.env.NODE_ENV  || 'development',
    });
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
});

// ─── Local dev ────────────────────────────────────────────────────────────────

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`   DB: ${process.env.DB_HOST}/${process.env.DB_DATABASE}`);
        console.log(`   ORS: ${process.env.ORS_API_KEY ? '✓' : '✗ missing'}`);
    });
}

module.exports = app;