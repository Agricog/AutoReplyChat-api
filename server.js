import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';

// Import routes
import chatRoutes from './routes/chat.js';
import contentRoutes from './routes/content.js';
import customersRoutes from './routes/customers.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import loginRoute from './routes/login.js';
import signupRoute from './routes/signup.js';

// Import middleware
import { requireAuth } from './middleware/auth.js';

// Import migrations
import { runMigrations } from './db/migrate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy
app.set('trust proxy', 1);

// PostgreSQL session store
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// Run database migrations on startup
await runMigrations();

// CORS configuration
app.use(cors({
  origin: process.env.WIDGET_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new PgSession({
    pool: pgPool,
    tableName: 'sessions',
    createTableIfMissing: false
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 15 * 60 * 1000,
    sameSite: 'lax'
  },
  name: 'sessionId'
}));

// Session timeout - extend on activity
app.use((req, res, next) => {
  if (req.session && req.session.customerId) {
    req.session.touch();
  }
  next();
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// Login and signup pages (no auth required)
app.use('/login', loginRoute);
app.use('/signup', signupRoute);

// Public chat endpoint (no auth required - used by widget)
app.use('/api/chat', chatRoutes);

// Protected routes - require authentication
app.use('/api/content', requireAuth, contentRoutes);
app.use('/api/customers', requireAuth, customersRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

// Admin routes (no auth for now)
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Auto Reply Chat API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Session store: PostgreSQL`);
});
