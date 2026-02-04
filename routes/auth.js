import express from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { query } from '../db/database.js';
import { loginLimiter, signupLimiter } from '../middleware/auth.js';

const router = express.Router();

// Validation helper
function validateEmail(email) {
  if (!email || !validator.isEmail(email)) {
    return { valid: false, error: 'Invalid email address' };
  }
  return { valid: true };
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*)' };
  }
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

    const businessEmailValidation = validateEmail(businessEmail);
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
      [name.trim(), email.toLowerCase(), businessEmail.toLowerCase()]
    );

    const customerId = customerResult.rows[0].id;

    // Create auth record
    await query(
      `INSERT INTO customers_auth (customer_id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [customerId, email.toLowerCase(), passwordHash]
    );

    // Create session
    req.session.customerId = customerId;
    req.session.email = email.toLowerCase();

    console.log('[AUTH] New account created:', { customerId, email: email.toLowerCase() });

    res.json({
      success: true,
      message: 'Account created successfully',
      customerId,
      email: email.toLowerCase()
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

    // Validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Get user
    const result = await query(
      `SELECT ca.id, ca.customer_id, ca.email, ca.password_hash, 
              ca.failed_login_attempts, ca.locked_until,
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
      const minutesRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);
      return res.status(423).json({ 
        error: `Account locked due to too many failed attempts. Try again in ${minutesRemaining} minutes.`
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Increment failed attempts
      const newFailedAttempts = user.failed_login_attempts + 1;
      const lockAccount = newFailedAttempts >= 5;

      await query(
        `UPDATE customers_auth 
         SET failed_login_attempts = $1,
             locked_until = $2
         WHERE id = $3`,
        [
          newFailedAttempts,
          lockAccount ? new Date(Date.now() + 15 * 60 * 1000) : null, // Lock for 15 minutes
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

    // Successful login - reset failed attempts and update last login
    await query(
      `UPDATE customers_auth 
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    // Create session
    req.session.customerId = user.customer_id;
    req.session.email = user.email;
    req.session.name = user.name;

    console.log('[AUTH] Login successful:', { customerId: user.customer_id, email: user.email });

    res.json({
      success: true,
      message: 'Login successful',
      customerId: user.customer_id,
      email: user.email,
      name: user.name
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
    
    res.clearCookie('connect.sid');
    
    console.log('[AUTH] Logout successful:', { customerId });
    
    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// GET /api/auth/session - Check session status
router.get('/session', (req, res) => {
  if (req.session && req.session.customerId) {
    res.json({
      authenticated: true,
      customerId: req.session.customerId,
      email: req.session.email,
      name: req.session.name
    });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;
