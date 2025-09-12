require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./src/routes/api');

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 4000;

// --- Middleware ---
// Enable Cross-Origin Resource Sharing (CORS) so the React frontend can call the API
app.use(cors());
// Parse incoming JSON requests
app.use(express.json());

// --- Routes ---
// Mount the API routes under the /api path
app.use('/api', apiRoutes);

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});