import pg from 'pg';
const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('✓ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper function to execute queries
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to get a client from the pool (for transactions)
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Initialize database with schema
export async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    
    // Skip pgvector for now - use keyword search instead
    // await query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Create customers table
    await query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        business_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create documents table
    await query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        title VARCHAR(500),
        content_type VARCHAR(50),
        source_url TEXT,
        content TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create embeddings table (without vector type for now)
    await query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create leads table
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        conversation JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes (skip vector index)
    await query('CREATE INDEX IF NOT EXISTS embeddings_customer_idx ON embeddings(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS documents_customer_idx ON documents(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads(customer_id)');
    
    console.log('✓ Database schema initialized successfully (using keyword search)');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}
    
    // Create documents table
    await query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        title VARCHAR(500),
        content_type VARCHAR(50),
        source_url TEXT,
        content TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create embeddings table
    await query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create leads table
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        conversation JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await query('CREATE INDEX IF NOT EXISTS embeddings_customer_idx ON embeddings(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
    await query('CREATE INDEX IF NOT EXISTS documents_customer_idx ON documents(customer_id)');
    await query('CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads(customer_id)');
    
    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export default pool;
