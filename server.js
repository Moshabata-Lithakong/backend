const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
require('dotenv').config();

const app = express();

// Enhanced CORS for Flutter web development - ALLOW ALL LOCALHOST PORTS
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow ALL localhost ports and your IP
    if (
      origin.includes('localhost') || 
      origin.includes('127.0.0.1') ||
      origin.includes('10.228.140.50') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      console.log('✅ Allowed origin:', origin);
      return callback(null, true);
    }
    
    // Allow your specific domains in production
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Handle pre-flight requests
app.options('*', cors());

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow Flutter web to load resources
}));
app.use(mongoSanitize());
app.use(xss());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Cloud connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api/v1/auth', require('./src/routes/auth'));
app.use('/api/v1/users', require('./src/routes/users'));
app.use('/api/v1/products', require('./src/routes/products'));
app.use('/api/v1/orders', require('./src/routes/orders'));
app.use('/api/v1/chats', require('./src/routes/chats'));
app.use('/api/v1/interviews', require('./src/routes/interviews'));
// FIXED: Add payment routes - THIS WAS MISSING!
app.use('/api/v1/payments', require('./src/routes/payments'));

// Health check
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Maseru Marketplace API is running',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'unknown'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Maseru Marketplace API Server is running!',
    version: '1.0.0'
  });
});

// Error handling for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Can't find ${req.originalUrl} on this server`,
    origin: req.headers.origin
  });
});

// Global error handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    origin: req.headers.origin,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Access via: http://localhost:${PORT}`);
  console.log(`📍 Or via your local IP: http://10.228.140.50:${PORT}`);
  console.log(`🌐 CORS enabled for ALL localhost ports (including random Flutter web ports)`);
  console.log(`💳 Payment routes mounted at: http://localhost:${PORT}/api/v1/payments`);
});

// Socket.io setup - updated for web
const io = require('socket.io')(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') ||
        origin.includes('10.228.140.50')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
    console.log(`User ${socket.id} joined chat ${chatId}`);
  });
  socket.on('send_message', (data) => {
    socket.to(data.chatId).emit('receive_message', data);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.set('io', io);
module.exports = app;