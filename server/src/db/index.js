const { Pool } = require('pg');

// The Pool will automatically use the environment variables
// (PGUSER, PGHOST, PGDATABASE, PGPASSWORD, PGPORT) if they are set,
// which dotenv handles for us.
const pool = new Pool();

// Export a query function that we can use throughout the application
module.exports = {
  query: (text, params) => pool.query(text, params),
};