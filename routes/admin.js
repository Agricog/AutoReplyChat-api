import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// Simple admin auth check - uses environment variable
function requireAdminAuth(req, res, next) {
  const adminKey = req.query.key || req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin - Admin dashboard
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    // Get all customers with auth info and stats
    const customers = await query(`
      SELECT 
        c.id,
        c.name,
        c.email,
        c.business_email,
        c.created_at,
        c.trial_ends_at,
        c.subscription_status,
        ca.last_login,
        ca.failed_login_attempts,
        ca.locked_until,
        (SELECT COUNT(*) FROM bots WHERE customer_id = c.id) as bot_count,
        (SELECT COUNT(*) FROM documents WHERE customer_id = c.id) as doc_count,
        (SELECT COUNT(*) FROM leads WHERE bot_id IN (SELECT id FROM bots WHERE customer_id = c.id)) as lead_count
      FROM customers c
      LEFT JOIN customers_auth ca ON ca.customer_id = c.id
      ORDER BY c.created_at DESC
    `);

    const totalCustomers = customers.rows.length;
    const activeTrials = customers.rows.filter(c => 
      c.subscription_status === 'trial' && c.trial_ends_at && new Date(c.trial_ends_at) > new Date()
    ).length;
    const expiredTrials = customers.rows.filter(c => 
      c.subscription_status === 'trial' && c.trial_ends_at && new Date(c.trial_ends_at) <= new Date()
    ).length;
    const paidCustomers = customers.rows.filter(c => c.subscription_status === 'active').length;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Dashboard - AutoReplyChat</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f1f5f9;
            color: #1e293b;
          }
          .header {
            background: #0f172a;
            color: white;
            padding: 20px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header h1 { font-size: 22px; }
          .header .brand { color: #f59e0b; }
          .container { max-width: 1200px; margin: 0 auto; padding: 30px; }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 30px;
          }
          .stat-card {
            background: white;
            padding: 24px;
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .stat-card .label { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .stat-card .value { font-size: 36px; font-weight: 700; margin-top: 8px; }
          .stat-card .value.green { color: #16a34a; }
          .stat-card .value.amber { color: #d97706; }
          .stat-card .value.red { color: #dc2626; }
          .stat-card .value.blue { color: #2563eb; }
          
          .table-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .table-card h2 {
            padding: 20px 24px;
            font-size: 18px;
            border-bottom: 1px solid #e2e8f0;
          }
          table { width: 100%; border-collapse: collapse; }
          th {
            text-align: left;
            padding: 12px 16px;
            background: #f8fafc;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            border-bottom: 1px solid #e2e8f0;
          }
          td {
            padding: 14px 16px;
            font-size: 14px;
            border-bottom: 1px solid #f1f5f9;
          }
          tr:hover { background: #f8fafc; }
          
          .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
          }
          .badge-trial { background: #fef3c7; color: #92400e; }
          .badge-active { background: #dcfce7; color: #166534; }
          .badge-expired { background: #fee2e2; color: #991b1b; }
          .badge-cancelled { background: #e2e8f0; color: #475569; }
          
          .days-left { font-size: 12px; color: #64748b; }
          .days-left.urgent { color: #dc2626; font-weight: 600; }
          
          .no-data { padding: 40px; text-align: center; color: #94a3b8; }
          
          .actions { display: flex; gap: 8px; }
          .btn-sm {
            padding: 4px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
          }
          .btn-view { background: #e0f2fe; color: #0369a1; }
          .btn-view:hover { background: #bae6fd; }
          .btn-extend { background: #dcfce7; color: #166534; }
          .btn-extend:hover { background: #bbf7d0; }
          .btn-danger { background: #fee2e2; color: #991b1b; }
          .btn-danger:hover { background: #fecaca; }
          .refresh-btn {
            background: #f59e0b;
            color: #0f172a;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
          }
          .refresh-btn:hover { background: #fbbf24; }
          
          .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            display: none;
            z-index: 100;
          }
          .toast.success { background: #16a34a; display: block; }
          .toast.error { background: #dc2626; display: block; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1><span class="brand">AutoReplyChat</span> Admin</h1>
          <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
        </div>
        
        <div class="container">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="label">Total Customers</div>
              <div class="value blue">${totalCustomers}</div>
            </div>
            <div class="stat-card">
              <div class="label">Active Trials</div>
              <div class="value amber">${activeTrials}</div>
            </div>
            <div class="stat-card">
              <div class="label">Expired Trials</div>
              <div class="value red">${expiredTrials}</div>
            </div>
            <div class="stat-card">
              <div class="label">Paid Customers</div>
              <div class="value green">${paidCustomers}</div>
            </div>
          </div>

          <div class="table-card">
            <h2>All Customers</h2>
            ${customers.rows.length === 0 ? '<div class="no-data">No customers yet</div>' : `
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Trial</th>
                  <th>Signed Up</th>
                  <th>Last Login</th>
                  <th>Bots</th>
                  <th>Docs</th>
                  <th>Leads</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${customers.rows.map(c => {
                  const status = c.subscription_status || 'trial';
                  const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
                  const now = new Date();
                  const daysLeft = trialEnd ? Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)) : null;
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const isUrgent = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;
                  
                  let badgeClass = 'badge-trial';
                  let badgeText = 'Trial';
                  if (status === 'active') { badgeClass = 'badge-active'; badgeText = 'Paid'; }
                  else if (status === 'cancelled') { badgeClass = 'badge-cancelled'; badgeText = 'Cancelled'; }
                  else if (isExpired) { badgeClass = 'badge-expired'; badgeText = 'Expired'; }
                  
                  return `
                    <tr>
                      <td>${c.id}</td>
                      <td><strong>${c.name || '—'}</strong></td>
                      <td>${c.email || '—'}<br><small style="color:#94a3b8">${c.business_email || ''}</small></td>
                      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                      <td>
                        ${daysLeft !== null 
                          ? (isExpired 
                            ? '<span class="days-left urgent">Expired</span>'
                            : `<span class="days-left ${isUrgent ? 'urgent' : ''}">${daysLeft} days left</span>`)
                          : '<span class="days-left">No trial</span>'
                        }
                      </td>
                      <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td>${c.last_login ? new Date(c.last_login).toLocaleDateString('en-GB') : 'Never'}</td>
                      <td>${c.bot_count}</td>
                      <td>${c.doc_count}</td>
                      <td>${c.lead_count}</td>
                      <td>
                        <div class="actions">
                          <button class="btn-sm btn-view" onclick="viewCustomer(${c.id})">View</button>
                          <button class="btn-sm btn-extend" onclick="extendTrial(${c.id})">+30d</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            `}
          </div>
        </div>

        <div id="toast" class="toast"></div>

        <script>
          const adminKey = new URLSearchParams(window.location.search).get('key');
          
          function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type;
            setTimeout(() => { toast.className = 'toast'; }, 3000);
          }

          async function viewCustomer(id) {
            window.open('/api/dashboard/' + id + '?admin=true', '_blank');
          }

          async function extendTrial(customerId) {
            if (!confirm('Extend trial by 30 days?')) return;
            
            try {
              const response = await fetch('/api/admin/extend-trial', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'X-Admin-Key': adminKey
                },
                body: JSON.stringify({ customerId })
              });
              
              const data = await response.json();
              if (data.success) {
                showToast('Trial extended by 30 days', 'success');
                setTimeout(() => location.reload(), 1000);
              } else {
                showToast(data.error || 'Failed', 'error');
              }
            } catch (error) {
              showToast('Error: ' + error.message, 'error');
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load admin dashboard' });
  }
});

// POST /api/admin/extend-trial - Extend a customer's trial by 30 days
router.post('/extend-trial', requireAdminAuth, async (req, res) => {
  try {
    const { customerId } = req.body;
    
    await query(`
      UPDATE customers 
      SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + INTERVAL '30 days',
          subscription_status = 'trial'
      WHERE id = $1
    `, [customerId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Extend trial error:', error);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

// POST /api/admin/create-customer - Create test customer (legacy)
router.post('/create-customer', requireAdminAuth, async (req, res) => {
  try {
    const { name, email, businessEmail } = req.body;
    
    const existing = await query('SELECT id FROM customers WHERE id = 1');
    
    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'Customer already exists', customerId: 1 });
    }
    
    await query(
      `INSERT INTO customers (id, name, email, business_email) VALUES (1, $1, $2, $3)`,
      [name, email, businessEmail]
    );
    
    res.json({ success: true, message: 'Customer created', customerId: 1 });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/backfill-embeddings - Generate embeddings for all existing chunks
// Usage: https://api.autoreplychat.com/api/admin/backfill-embeddings?key=YOUR_ADMIN_KEY
router.get('/backfill-embeddings', requireAdminAuth, async (req, res) => {
  try {
    // Ensure pgvector extension and embedding column exist
    await query('CREATE EXTENSION IF NOT EXISTS vector');
    await query('ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536)');

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OPENAI_API_KEY environment variable is not set' });
    }

    const BATCH_SIZE = 100;
    let processed = 0;
    let errors = 0;

    const countResult = await query('SELECT COUNT(*) as total FROM embeddings WHERE embedding IS NULL');
    const total = parseInt(countResult.rows[0].total);

    if (total === 0) {
      return res.json({ success: true, message: 'All chunks already have embeddings. Nothing to do.', total: 0 });
    }

    console.log(`[Backfill] Starting: ${total} chunks need embeddings`);

    while (true) {
      const batch = await query(
        'SELECT id, chunk_text FROM embeddings WHERE embedding IS NULL ORDER BY id ASC LIMIT $1',
        [BATCH_SIZE]
      );

      if (batch.rows.length === 0) break;

      try {
        const texts = batch.rows.map(r => r.chunk_text.replace(/\n+/g, ' ').trim());

        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
        });

        for (let i = 0; i < batch.rows.length; i++) {
          const embeddingStr = `[${response.data[i].embedding.join(',')}]`;
          await query(
            'UPDATE embeddings SET embedding = $1::vector WHERE id = $2',
            [embeddingStr, batch.rows[i].id]
          );
        }

        processed += batch.rows.length;
        console.log(`[Backfill] Progress: ${processed}/${total}`);
      } catch (batchError) {
        console.error('[Backfill] Batch error:', batchError.message);
        errors++;

        // Wait on rate limits
        if (batchError.status === 429) {
          console.log('[Backfill] Rate limited, waiting 60s...');
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }

        if (errors > 10) {
          return res.json({
            success: false,
            message: `Stopped after too many errors. Processed ${processed}/${total}.`,
            processed,
            total,
            errors
          });
        }
      }

      // Small delay between batches to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    // Try to create the vector index now that we have data
    try {
      await query('CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      console.log('[Backfill] ✓ Vector index created');
    } catch (indexError) {
      console.log('[Backfill] Vector index creation skipped:', indexError.message);
    }

    console.log(`[Backfill] Complete: ${processed}/${total} chunks embedded`);

    res.json({
      success: true,
      message: `Backfill complete. ${processed}/${total} chunks now have embeddings.`,
      processed,
      total,
      errors
    });
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
