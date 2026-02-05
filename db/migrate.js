import { query } from './database.js';

export async function runMigrations() {
  console.log('[Migration] Checking database schema...');
  
  try {
    // Create customers_auth table
    await query(`
      CREATE TABLE IF NOT EXISTS customers_auth (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP
      )
    `);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_customers_auth_email ON customers_auth(email)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_customers_auth_customer_id ON customers_auth(customer_id)`);
    
    // Create sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)`);
    
    // Add bot_instructions column to customers table
    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS bot_instructions TEXT
    `);
    
    // Insert test account if doesn't exist
    await query(`
      INSERT INTO customers_auth (customer_id, email, password_hash)
      VALUES (
        1, 
        'test@autoreplychat.com',
        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
      )
      ON CONFLICT (customer_id) DO NOTHING
    `);
    
    console.log('[Migration] ✓ Database schema up to date');
  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  }
}
