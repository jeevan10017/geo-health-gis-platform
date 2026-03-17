
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user:     process.env.DB_USER     || 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    database: process.env.DB_DATABASE || 'geo_health_db',
    password: process.env.DB_PASSWORD || 'Password123',
    port:     parseInt(process.env.DB_PORT || '5432'),

    // ── Vercel serverless settings ────────────────────────────────────────
    max:                        3,      // small pool — many Vercel instances can run in parallel
    min:                        0,      // don't hold idle connections between invocations
    idleTimeoutMillis:          10000,  // release connections quickly
    connectionTimeoutMillis:    8000,   // fail fast if GCP VM unreachable (Vercel timeout is 10s)
    allowExitOnIdle:            true,   // let the process exit when idle (required for serverless)

    // ── GCP VM — NO SSL (Cloud SQL uses SSL, raw VM does not by default) ──
    ssl: false,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected client error:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};