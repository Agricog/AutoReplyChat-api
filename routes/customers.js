import express from 'express';
import { query } from '../db/database.js';
import crypto from 'crypto';

const router = express.Router();

// POST /api/customers - Create new customer
router.post('/', async (req, res) => {
  try {
    const { name, email, businessEmail } = req.body;

    if (!name || !email || !businessEmail) {
      return res.status(400).json({ error: 'name, email, and businessEmail are required' });
    }

    // Generate unique API key for customer
    const apiKey = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO customers (name, email, business_email)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, business_email, created_at`,
      [name, email, businessEmail]
    );

    const customer = result.rows[0];

    res.json({
      success: true,
      customer: {
        ...customer,
        apiKey, // In production, hash this before storing
        embedCode: generateEmbedCode(customer.id)
      }
    });

  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// GET /api/customers - List all customers
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, business_email, created_at,
       (SELECT COUNT(*) FROM documents WHERE customer_id = customers.id) as document_count,
       (SELECT COUNT(*) FROM leads WHERE customer_id = customers.id) as lead_count
       FROM customers
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      customers: result.rows
    });

  } catch (error) {
    console.error('Error listing customers:', error);
    res.status(500).json({ error: 'Failed to list customers' });
  }
});

// GET /api/customers/:id - Get single customer
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name, email, business_email, created_at
       FROM customers
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = result.rows[0];

    res.json({
      success: true,
      customer: {
        ...customer,
        embedCode: generateEmbedCode(customer.id)
      }
    });

  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

// GET /api/customers/:id/leads - Get customer's leads
router.get('/:id/leads', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name, email, conversation, created_at
       FROM leads
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      leads: result.rows
    });

  } catch (error) {
    console.error('Error getting leads:', error);
    res.status(500).json({ error: 'Failed to get leads' });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM customers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Customer deleted'
    });

  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Helper: Generate embed code for customer
function generateEmbedCode(customerId) {
  const widgetUrl = process.env.WIDGET_URL || 'https://autaichat-production.up.railway.app';
  
  return `<!-- AutaiChat Widget -->
<iframe 
  src="${widgetUrl}?customer=${customerId}"
  style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;"
  allow="clipboard-write"
></iframe>`;
}

export default router;
