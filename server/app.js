
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const apiRoutes = require('./src/routes/api');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─────────────────────────────────────────────
//  CORS
// ─────────────────────────────────────────────

const allowedOrigins = [
    'https://geo-health-medinapur.vercel.app',
    'http://localhost:5173'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json());


// ─────────────────────────────────────────────
//  Health-check (keep-alive ping)
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        status:  'ok',
        message: 'Server is healthy and awake'
    });
});


// ─────────────────────────────────────────────
//  API routes
// ─────────────────────────────────────────────

app.use('/api', apiRoutes);


// ─────────────────────────────────────────────
//  Start server (skipped when imported by tests)
// ─────────────────────────────────────────────

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;