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
    
    // Create messages table
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)`);
    
    // Create documents table
    await query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        title VARCHAR(255),
        content TEXT,
        content_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id)`);
    
    // Add bot_instructions column to customers table
    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS bot_instructions TEXT
    `);

    // Add trial_ends_at column to customers table
    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP
    `);

    // Add subscription_status column to customers table
    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial'
    `);

    // Add Stripe columns to customers table
    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)
    `);

    await query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)
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
