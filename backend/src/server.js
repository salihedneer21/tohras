require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDatabase = require('./config/database');
const { validateReplicateToken } = require('./config/replicate');

// Import routes
const userRoutes = require('./routes/userRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const generationRoutes = require('./routes/generationRoutes');
const evalRoutes = require('./routes/evalRoutes');
const bookRoutes = require('./routes/bookRoutes');
const promptRoutes = require('./routes/promptRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const automationRoutes = require('./routes/automationRoutes');
const { initialiseAutomationWatchers } = require('./services/automationWorkflow');

// Initialize express app
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/books', bookRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/generations', generationRoutes);
app.use('/api/evals', evalRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/automation', automationRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AI Book Story API is running',
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to AI Book Story API',
    version: '1.0.0',
    endpoints: {
      users: '/api/users',
      books: '/api/books',
      prompts: '/api/prompts',
      trainings: '/api/trainings',
      generations: '/api/generations',
      evals: '/api/evals',
      automation: '/api/automation',
      health: '/health',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Validate Replicate token
    validateReplicateToken();

    // Connect to database
    await connectDatabase();

    // Initialise automation watchers
    initialiseAutomationWatchers();

    // Start listening
    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

startServer();

module.exports = app;
