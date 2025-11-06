require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  'https://geo-health-medinapur.vercel.app',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};


app.use(cors(corsOptions));
app.use(express.json());


app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "Server is healthy and awake" 
  });
});

app.use('/api', apiRoutes);


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running locally on http://localhost:${PORT}`);
  });
}


module.exports = app;