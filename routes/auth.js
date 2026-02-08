import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import { loginLimiter, signupLimiter, generateToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

const router = express.Router();

// Validation helpers
function validateEmail(email) {
  if (!email) return { valid: false, error: 'Email is required' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return { valid: false, error: 'Invalid email format' };
  if (email.length > 255) return { valid: false, error: 'Email too long' };
  return { valid: true };
}

function validatePassword(password) {
  if (!password) return { valid: false, error: 'Password is required' };
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one number' };
  if (!/[!@#$%^&*]/.test(password)) return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*)' };
  return { valid: true };
}

// POST /api/auth/signup - Create new account
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, businessEmail, password } = req.body;

    // Validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }

    const bEmailToUse = businessEmail || email;
    const businessEmailValidation = validateEmail(bEmailToUse);
    if (!businessEmailValidation.valid) {
      return res.status(400).json({ error: 'Invalid business email address' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM customers_auth WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create customer
    const customerResult = await query(
      `INSERT INTO customers (name, email, business_email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name.trim(), email.toLowerCase(), bEmailToUse.toLowerCase()]
    );

    const customerId = customerResult.rows[0].id;

    // Create auth record
    await query(
      `INSERT INTO customers_auth (customer_id, email, password_hash, role, bot_limit)
       VALUES ($1, $2, $3, 'customer', 1)`,
      [customerId, email.toLowerCase(), passwordHash]
    );

    // Create first bot for new customer
    const botPublicId = crypto.randomBytes(12).toString('hex');
    await query(
      `INSERT INTO bots (customer_id, name, public_id, bot_instructions)
       VALUES ($1, $2, $3, 'You are a helpful assistant.')`,
      [customerId, 'My First Bot', botPublicId]
    );

    // Create session (for server-rendered pages)
    req.session.customerId = customerId;
    req.session.email = email.toLowerCase();
    req.session.name = name.trim();

    // Generate JWT token (for React frontend)
    const token = generateToken({
      customerId,
      email: email.toLowerCase(),
      name: name.trim(),
      role: 'customer',
      botLimit: 1
    });

    console.log('[AUTH] New account created:', { customerId, email: email.toLowerCase() });

    res.json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        customerId,
        email: email.toLowerCase(),
        name: name.trim(),
        role: 'customer',
        botLimit: 1
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login - Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await query(
      `SELECT ca.id, ca.customer_id, ca.email, ca.password_hash, 
              ca.failed_login_attempts, ca.locked_until, ca.role, ca.bot_limit,
              c.name
       FROM customers_auth ca
       JOIN customers c ON c.id = ca.customer_id
       WHERE ca.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ 
        error: 'Account locked due to too many failed attempts. Try again later.'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Increment failed attempts
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockAccount = newFailedAttempts >= 5;

      await query(
        `UPDATE customers_auth 
         SET failed_login_attempts = $1,
             locked_until = $2
         WHERE id = $3`,
        [
          newFailedAttempts,
          lockAccount ? new Date(Date.now() + 15 * 60 * 1000) : null,
          user.id
        ]
      );

      if (lockAccount) {
        return res.status(423).json({ 
          error: 'Account locked due to too many failed attempts. Try again in 15 minutes.'
        });
      }

      return res.status(401).json({ 
        error: 'Invalid email or password',
        attemptsRemaining: 5 - newFailedAttempts
      });
    }

    // Successful login - reset failed attempts
    await query(
      `UPDATE customers_auth 
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    // Create session (for server-rendered pages)
    req.session.customerId = user.customer_id;
    req.session.email = user.email;
    req.session.name = user.name;

    // Generate JWT token (for React frontend)
    const token = generateToken({
      customerId: user.customer_id,
      email: user.email,
      name: user.name,
      role: user.role || 'customer',
      botLimit: user.bot_limit || 1
    });

    console.log('[AUTH] Login successful:', { customerId: user.customer_id, email: user.email });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        customerId: user.customer_id,
        email: user.email,
        name: user.name,
        role: user.role || 'customer',
        botLimit: user.bot_limit || 1
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', (req, res) => {
  const customerId = req.session?.customerId;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    res.clearCookie('sessionId');
    console.log('[AUTH] Logout successful:', { customerId });
    
    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// GET /api/auth/session - Check session/token status
router.get('/session', (req, res) => {
  // Check session
  if (req.session && req.session.customerId) {
    return res.json({
      authenticated: true,
      customerId: req.session.customerId,
      email: req.session.email,
      name: req.session.name
    });
  }
  
  // Check JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return res.json({
        authenticated: true,
        user: {
          customerId: decoded.customerId,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
          botLimit: decoded.botLimit
        }
      });
    } catch (err) {
      return res.json({ authenticated: false });
    }
  }

  res.json({ authenticated: false });
});

export default router;
