import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// Helper: Check if customer has active access
function hasActiveAccess(customer) {
  const status = customer.subscription_status || 'trial';
  
  // Paid customers always have access
  if (status === 'active') return true;
  
  // Trial customers - check if trial is still valid
  if (status === 'trial' && customer.trial_ends_at) {
    return new Date(customer.trial_ends_at) > new Date();
  }
  
  return false;
}

// Helper: Render upgrade page
function renderUpgradePage(customerId, customer) {
  const trialEnd = customer.trial_ends_at ? new Date(customer.trial_ends_at) : null;
  const daysExpired = trialEnd ? Math.abs(Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24))) : 0;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Upgrade Your Account - AutoReplyChat</title>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'DM Sans', sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }
        .font-display { font-family: 'Crimson Pro', serif; }
        .container {
          max-width: 560px;
          width: 100%;
          text-align: center;
        }
        .logo {
          font-family: 'Crimson Pro', serif;
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 40px;
        }
        .logo .accent { color: #f59e0b; }
        .card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 48px 40px;
        }
        .icon {
          width: 64px;
          height: 64px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 28px;
        }
        h1 {
          font-family: 'Crimson Pro', serif;
          font-size: 32px;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 12px;
        }
        .subtitle {
          color: #94a3b8;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .price-block {
          background: #0f172a;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
        }
        .setup-price {
          font-family: 'Crimson Pro', serif;
          font-size: 48px;
          font-weight: 700;
          color: #f59e0b;
        }
        .setup-label {
          color: #94a3b8;
          font-size: 14px;
          margin-top: 4px;
        }
        .monthly-note {
          color: #64748b;
          font-size: 13px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #334155;
        }
        .features {
          text-align: left;
          margin-bottom: 32px;
        }
        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          font-size: 14px;
          color: #cbd5e1;
        }
        .feature-check {
          width: 20px;
          height: 20px;
          background: rgba(245, 158, 11, 0.15);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #f59e0b;
          font-size: 12px;
        }
        .btn-subscribe {
          display: block;
          width: 100%;
          padding: 16px;
          background: #f59e0b;
          color: #0f172a;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-subscribe:hover {
          background: #fbbf24;
          transform: translateY(-1px);
        }
        .btn-subscribe:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .terms {
          color: #64748b;
          font-size: 12px;
          margin-top: 16px;
          line-height: 1.5;
        }
        .footer-links {
          margin-top: 32px;
          display: flex;
          gap: 24px;
          justify-content: center;
        }
        .footer-links a {
          color: #64748b;
          font-size: 13px;
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-links a:hover {
          color: #f59e0b;
        }
        .error-msg {
          background: #451a03;
          border: 1px solid #92400e;
          color: #fbbf24;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <span class="accent">Auto</span>ReplyChat
        </div>
        
        <div class="card">
          <div class="icon">⏰</div>
          <h1 class="font-display">Your trial has ended</h1>
          <p class="subtitle">
            Your 30-day free trial expired ${daysExpired} day${daysExpired !== 1 ? 's' : ''} ago. 
            Subscribe now to restore access to your dashboard, chatbots, and all your training data.
          </p>

          <div id="errorMsg" class="error-msg"></div>

          <div class="price-block">
            <div class="setup-price">£399</div>
            <div class="setup-label">One-time setup fee (includes first month)</div>
            <div class="monthly-note">Then £99/month · No contract · Cancel anytime</div>
          </div>

          <div class="features">
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Unlimited AI conversations
            </div>
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Unlimited document training
            </div>
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Lead capture & email notifications
            </div>
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Custom branded widget
            </div>
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Multi-language support (95+ languages)
            </div>
            <div class="feature-item">
              <div class="feature-check">✓</div>
              Priority support
            </div>
          </div>

          <button class="btn-subscribe" id="subscribeBtn" onclick="handleSubscribe()">
            Subscribe Now — £399
          </button>

          <p class="terms">
            You'll be redirected to our secure payment provider (Stripe). 
            Your subscription includes a one-time £399 setup fee (covering setup and your first month), 
            then £99/month. Cancel anytime from your billing portal.
          </p>
        </div>

        <div class="footer-links">
          <a href="https://autoreplychat.com">Back to Homepage</a>
          <a href="https://autoreplychat.com/terms">Terms of Service</a>
          <a href="https://autoreplychat.com/privacy">Privacy Policy</a>
          <a href="#" onclick="logout(); return false;">Sign Out</a>
        </div>
      </div>

      <script>
        async function handleSubscribe() {
          const btn = document.getElementById('subscribeBtn');
          const errorMsg = document.getElementById('errorMsg');
          
          btn.disabled = true;
          btn.textContent = 'Redirecting to payment...';
          errorMsg.style.display = 'none';

          try {
            const response = await fetch('/api/stripe/create-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            });

            const data = await response.json();

            if (data.url) {
              window.location.href = data.url;
            } else {
              throw new Error(data.error || 'Failed to create checkout session');
            }
          } catch (error) {
            errorMsg.textContent = 'Something went wrong. Please try again or contact support.';
            errorMsg.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Subscribe Now — £399';
          }
        }

        function logout() {
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            .then(() => window.location = '/login');
        }
      </script>
    </body>
    </html>
  `;
}

// GET /api/dashboard/:customerId
router.get('/:customerId', async (req, res) => {
  // SECURITY: Verify user can only access their own dashboard
  const requestedCustomerId = parseInt(req.params.customerId);
  const sessionCustomerId = req.session.customerId;
  
  if (requestedCustomerId !== sessionCustomerId) {
    console.warn('[SECURITY] Unauthorized dashboard access attempt:', {
      sessionCustomerId,
      requestedCustomerId,
      ip: req.ip
    });
    
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Access Denied</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 100px;">
        <h1>403 - Access Denied</h1>
        <p>You can only access your own dashboard.</p>
        <a href="/api/dashboard/${sessionCustomerId}">Go to your dashboard</a>
      </body>
      </html>
    `);
  }

  try {
    const customerId = requestedCustomerId;
    const selectedBotId = parseInt(req.query.bot) || null;
    const activeTab = req.query.tab || 'overview';
    
    // Get customer info including trial/subscription status
    const customerResult = await query(
      'SELECT name, email, trial_ends_at, subscription_status, stripe_customer_id FROM customers WHERE id = $1',
      [customerId]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).send('Customer not found');
    }
    
    const customer = customerResult.rows[0];

    // TRIAL/SUBSCRIPTION GATE
    // Allow admin bypass for viewing customer dashboards
    const isAdminView = req.query.admin === 'true';
    if (!hasActiveAccess(customer) && !isAdminView) {
      return res.send(renderUpgradePage(customerId, customer));
    }
    
    // Get all bots for this customer
    const botsResult = await query(
      'SELECT id, public_id, name, bot_instructions, greeting_message, header_title, header_color, text_color, lead_capture_enabled, notification_emails, conversation_notifications, chat_bubble_bg, avatar_bg, button_style, button_position, button_size, bar_message, chat_window_bg, user_message_bg, bot_message_bg, send_button_bg, lead_form_message, greeting_bubble_enabled, created_at FROM bots WHERE customer_id = $1 ORDER BY created_at ASC',
      [customerId]
    );
    
    const bots = botsResult.rows;
    
   // If no bots exist, create a default one
    if (bots.length === 0) {
      const crypto = await import('crypto');
      const newPublicId = crypto.default.randomBytes(12).toString('hex');
      const newBotResult = await query(
        `INSERT INTO bots (customer_id, name, public_id, bot_instructions) 
         VALUES ($1, 'My First Bot', $2, 'You are a helpful assistant.')
         RETURNING id, public_id, name, bot_instructions, greeting_message, created_at`,
        [customerId, newPublicId]
      );
      bots.push(newBotResult.rows[0]);
    }
    
    // Select current bot (from query param or first bot)
    const currentBot = selectedBotId 
      ? bots.find(b => b.id === selectedBotId) || bots[0]
      : bots[0];
    
    const botId = currentBot.id;
    const publicId = currentBot.public_id;
    const botInstructions = currentBot.bot_instructions || '';
    const greetingMessage = currentBot.greeting_message || 'Thank you for visiting! How may we assist you today?';
    const headerTitle = currentBot.header_title || 'Support Assistant';
    const headerColor = currentBot.header_color || '#3b82f6';
    const textColor = currentBot.text_color || '#ffffff';
    const leadCaptureEnabled = currentBot.lead_capture_enabled !== false;
    const notificationEmails = currentBot.notification_emails || '';
    const conversationNotifications = currentBot.conversation_notifications || false;
    const chatBubbleBg = currentBot.chat_bubble_bg || '#3b82f6';
    const avatarBg = currentBot.avatar_bg || '#e0e0e0';
    const buttonStyle = currentBot.button_style || 'circle';
    const buttonPosition = currentBot.button_position || 'right';
    const buttonSize = currentBot.button_size || 60;
    const barMessage = currentBot.bar_message || 'Chat Now';
    const chatWindowBg = currentBot.chat_window_bg || '#ffffff';
    const userMessageBg = currentBot.user_message_bg || '#3b82f6';
    const botMessageBg = currentBot.bot_message_bg || '#f3f4f6';
    const sendButtonBg = currentBot.send_button_bg || '#3b82f6';
    const leadFormMessage = currentBot.lead_form_message || "Want personalized help? Leave your details and we'll follow up";
    const greetingBubbleEnabled = currentBot.greeting_bubble_enabled !== false;
    
    // Get document count for current bot
    const docCountResult = await query(
      'SELECT COUNT(*) as count FROM documents WHERE bot_id = $1',
      [botId]
    );
    const documentCount = parseInt(docCountResult.rows[0].count);
    
    // Get lead count for current bot
    const leadCountResult = await query(
      'SELECT COUNT(*) as count FROM leads WHERE bot_id = $1',
      [botId]
    );
    const leadCount = parseInt(leadCountResult.rows[0].count);
    
    // Get message count for current bot
    const messageCountResult = await query(
      'SELECT COUNT(*) as count FROM messages WHERE bot_id = $1',
      [botId]
    );
    const messageCount = parseInt(messageCountResult.rows[0].count);
    
    // Get recent documents (non Q&A) for current bot
    const documentsResult = await query(
      `SELECT id, title, content_type, source_url, LENGTH(content) as char_count, created_at 
       FROM documents 
       WHERE bot_id = $1 AND (title NOT LIKE 'Q&A:%' OR title IS NULL)
       ORDER BY created_at DESC`,
      [botId]
    );
    
    const documents = documentsResult.rows.map(doc => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      type: doc.content_type,
      url: doc.source_url || '',
      charCount: parseInt(doc.char_count) || 0,
      date: new Date(doc.created_at).toLocaleDateString()
    }));
    
    // Get Q&A pairs for current bot
    const qaPairsResult = await query(
      `SELECT id, title, content, created_at 
       FROM documents 
       WHERE bot_id = $1 AND title LIKE 'Q&A:%'
       ORDER BY created_at DESC`,
      [botId]
    );
    
    const qaPairs = qaPairsResult.rows.map(doc => ({
      id: doc.id,
      title: doc.title.replace('Q&A: ', ''),
      content: doc.content,
      date: new Date(doc.created_at).toLocaleDateString()
    }));
    
    // Get recent leads for current bot
    const leadsResult = await query(
      `SELECT id, name, email, created_at 
       FROM leads 
       WHERE bot_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [botId]
    );
    
    const leads = leadsResult.rows.map(lead => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      date: new Date(lead.created_at).toLocaleDateString()
    }));

    // Get recent messages for current bot
    const messagesResult = await query(
      `SELECT m.id, m.role, m.content, m.created_at, l.name as lead_name, l.email as lead_email
       FROM messages m
       LEFT JOIN leads l ON m.lead_id = l.id
       WHERE m.bot_id = $1 
       ORDER BY m.created_at DESC 
       LIMIT 100`,
      [botId]
    );

    const messages = messagesResult.rows.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      leadName: msg.lead_name || 'Anonymous',
      leadEmail: msg.lead_email || '',
      date: new Date(msg.created_at).toLocaleString()
    }));

    // Generate bot initials for avatar
    const getBotInitials = (name) => {
      return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    };

    // Calculate trial/subscription info for dashboard banner
    const subscriptionStatus = customer.subscription_status || 'trial';
    const trialEnd = customer.trial_ends_at ? new Date(customer.trial_ends_at) : null;
    const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const showTrialBanner = subscriptionStatus === 'trial' && daysLeft !== null && daysLeft <= 7;
    const isPaid = subscriptionStatus === 'active';

    // Render dashboard HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${currentBot.name} - AutoReplyChat</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1e293b;
            display: flex;
            min-height: 100vh;
          }

          /* Trial Banner */
          .trial-banner {
            background: linear-gradient(135deg, #92400e 0%, #78350f 100%);
            color: #fef3c7;
            padding: 10px 20px;
            font-size: 13px;
            text-align: center;
            font-weight: 500;
          }
          .trial-banner a {
            color: #fbbf24;
            font-weight: 700;
            text-decoration: underline;
            margin-left: 8px;
          }
          
          /* Bot Sidebar - Far Left */
          .bot-sidebar {
            width: 72px;
            background: #1e293b;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 16px 0;
            gap: 12px;
          }
          
          .bot-sidebar-logo {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 20px;
          }
          
          .bot-icon {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 600;
            font-size: 14px;
            background: #334155;
            color: #94a3b8;
            border: 2px solid transparent;
          }
          
          .bot-icon:hover { background: #475569; color: white; }
          .bot-icon.active { background: #3b82f6; color: white; border-color: #60a5fa; }
          
          .bot-icon-add {
            background: transparent;
            border: 2px dashed #475569;
            color: #64748b;
          }
          .bot-icon-add:hover { border-color: #3b82f6; color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
          
          /* Navigation Sidebar */
          .nav-sidebar { width: 240px; background: white; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
          .nav-header { padding: 20px; border-bottom: 1px solid #e2e8f0; }
          .nav-header h2 { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .nav-header p { font-size: 12px; color: #64748b; }
          .nav-section { padding: 16px 12px 8px; }
          .nav-section-title { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 8px; margin-bottom: 8px; }
          .nav-menu { list-style: none; }
          .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: all 0.15s; font-size: 14px; font-weight: 500; color: #64748b; margin-bottom: 2px; }
          .nav-item:hover { background: #f1f5f9; color: #1e293b; }
          .nav-item.active { background: #eff6ff; color: #3b82f6; }
          .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
          .nav-footer { margin-top: auto; padding: 16px; border-top: 1px solid #e2e8f0; }
          .user-info { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 8px; cursor: pointer; }
          .user-info:hover { background: #f1f5f9; }
          .user-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; }
          .user-details { flex: 1; min-width: 0; }
          .user-name { font-size: 14px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .user-email { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          
          /* Main Content */
          .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
          .main-header { background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
          .main-header h1 { font-size: 20px; font-weight: 600; color: #1e293b; }
          .header-actions { display: flex; align-items: center; gap: 12px; }
          
          .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
          .btn-primary { background: #3b82f6; color: white; }
          .btn-primary:hover { background: #2563eb; }
          .btn-secondary { background: white; color: #1e293b; border: 1px solid #e2e8f0; }
          .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
          .btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
          .btn-danger:hover { background: #fee2e2; }
          
          .main-body { flex: 1; overflow-y: auto; padding: 32px; }
          
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
          .stat-card { background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; }
          .stat-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
          .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
          .stat-icon.blue { background: #eff6ff; color: #3b82f6; }
          .stat-icon.green { background: #f0fdf4; color: #22c55e; }
          .stat-icon.purple { background: #faf5ff; color: #a855f7; }
          .stat-icon.orange { background: #fff7ed; color: #f97316; }
          .stat-value { font-size: 28px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
          .stat-label { font-size: 13px; color: #64748b; }
          
          .content-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
          .content-card-header { padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
          .content-card-header h3 { font-size: 16px; font-weight: 600; color: #1e293b; }
          .content-card-body { padding: 20px; }
          
          .form-group { margin-bottom: 20px; }
          .form-label { display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px; }
          .form-input { width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.15s; }
          .form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
          .form-textarea { min-height: 120px; resize: vertical; }
          .form-help { font-size: 12px; color: #64748b; margin-top: 6px; }
          
          .upload-area { border: 2px dashed #e2e8f0; border-radius: 12px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
          .upload-area:hover { border-color: #3b82f6; background: #f8fafc; }
          .upload-icon { width: 48px; height: 48px; background: #eff6ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #3b82f6; }
          .upload-title { font-size: 15px; font-weight: 500; color: #1e293b; margin-bottom: 4px; }
          .upload-subtitle { font-size: 13px; color: #64748b; }
          
          .list-item { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #f1f5f9; }
          .list-item:last-child { border-bottom: none; }
          .list-item-info { flex: 1; min-width: 0; }
          .list-item-title { font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 2px; }
          .list-item-meta { font-size: 13px; color: #64748b; }
          .list-item-actions { display: flex; gap: 8px; }
          
          .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
          .badge-blue { background: #eff6ff; color: #3b82f6; }
          .badge-green { background: #f0fdf4; color: #22c55e; }
          .badge-gray { background: #f1f5f9; color: #64748b; }
          
          .message-item { padding: 16px; border-radius: 8px; margin-bottom: 12px; }
          .message-item.user { background: #f1f5f9; }
          .message-item.assistant { background: #eff6ff; }
          .message-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
          .message-author { font-size: 13px; font-weight: 600; color: #1e293b; }
          .message-time { font-size: 12px; color: #94a3b8; }
          .message-content { font-size: 14px; color: #374151; line-height: 1.6; }
          
          .embed-section { background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
          .embed-section h4 { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
          .embed-section p { font-size: 13px; color: #64748b; margin-bottom: 16px; }
          .code-block { background: #1e293b; border-radius: 8px; padding: 16px; font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; color: #e2e8f0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
          .copy-row { display: flex; gap: 12px; margin-top: 12px; }
          .copy-input { flex: 1; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: white; }
          
          .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
          .modal-overlay.show { display: flex; }
          .modal { background: white; border-radius: 16px; padding: 24px; max-width: 440px; width: 90%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
          .modal h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
          .modal p { font-size: 14px; color: #64748b; margin-bottom: 20px; }
          .modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
          
          .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; display: none; }
          .alert-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
          .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
          
          .tab-panel { display: none; }
          .tab-panel.active { display: block; }
          
          .toggle-group { display: flex; background: #f1f5f9; border-radius: 8px; padding: 4px; margin-bottom: 16px; }
          .toggle-btn { flex: 1; padding: 8px 16px; border: none; background: transparent; border-radius: 6px; font-size: 14px; font-weight: 500; color: #64748b; cursor: pointer; transition: all 0.15s; }
          .toggle-btn.active { background: white; color: #1e293b; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: #f1f5f9; }
          ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          
          @media (max-width: 1200px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 768px) { .nav-sidebar { display: none; } .stats-grid { grid-template-columns: 1fr; } }
        </style>
      </head>
      <body>
        <!-- Bot Sidebar -->
        <div class="bot-sidebar">
          <div class="bot-sidebar-logo">AC</div>
          ${bots.map(bot => `
            <div class="bot-icon ${bot.id === botId ? 'active' : ''}" 
                 onclick="switchBot(${bot.id})" 
                 title="${bot.name}">
              ${getBotInitials(bot.name)}
            </div>
          `).join('')}
          <div class="bot-icon bot-icon-add" onclick="showCreateBotModal()" title="Create new bot">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </div>
        </div>
        
        <!-- Navigation Sidebar -->
        <div class="nav-sidebar">
          <div class="nav-header">
            <h2>${currentBot.name}</h2>
            <p>Bot ID: ${botId}</p>
          </div>
          
          <div class="nav-section">
            <div class="nav-section-title">Overview</div>
            <ul class="nav-menu">
              <li class="nav-item ${activeTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                Dashboard
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <div class="nav-section-title">Training Data</div>
            <ul class="nav-menu">
              <li class="nav-item ${activeTab === 'upload' ? 'active' : ''}" onclick="switchTab('upload')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                Upload Content
              </li>
              <li class="nav-item ${activeTab === 'documents' ? 'active' : ''}" onclick="switchTab('documents')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Documents
              </li>
              <li class="nav-item ${activeTab === 'qa' ? 'active' : ''}" onclick="switchTab('qa')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Q&A Pairs
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <div class="nav-section-title">Activity</div>
            <ul class="nav-menu">
              <li class="nav-item ${activeTab === 'leads' ? 'active' : ''}" onclick="switchTab('leads')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Leads
              </li>
              <li class="nav-item ${activeTab === 'messages' ? 'active' : ''}" onclick="switchTab('messages')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                Messages
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <div class="nav-section-title">Settings</div>
            <ul class="nav-menu">
              <li class="nav-item ${activeTab === 'behavior' ? 'active' : ''}" onclick="switchTab('behavior')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Bot Behavior
              </li>
              <li class="nav-item ${activeTab === 'appearance' ? 'active' : ''}" onclick="switchTab('appearance')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
                Appearance
              </li>
              <li class="nav-item ${activeTab === 'deploy' ? 'active' : ''}" onclick="switchTab('deploy')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                Deploy
              </li>
              ${isPaid ? `
              <li class="nav-item" onclick="openBillingPortal()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                Billing
              </li>
              ` : ''}
            </ul>
          </div>
          
          <div class="nav-footer">
            <div class="user-info">
              <div class="user-avatar">${customer.name.charAt(0).toUpperCase()}</div>
              <div class="user-details">
                <div class="user-name">${customer.name}</div>
                <div class="user-email">${customer.email}</div>
              </div>
            </div>
            <button onclick="logout()" class="btn btn-secondary" style="width: 100%; margin-top: 12px;">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
              Sign Out
            </button>
          </div>
        </div>
        
        <!-- Main Content -->
        <div class="main-content">
          ${showTrialBanner ? `
          <div class="trial-banner">
            ⏰ Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. 
            <a href="#" onclick="handleUpgrade(); return false;">Subscribe now</a> to keep your chatbots running.
          </div>
          ` : ''}

          ${req.query.payment === 'success' ? `
          <div style="background: #f0fdf4; color: #15803d; border-bottom: 1px solid #bbf7d0; padding: 12px 32px; font-size: 14px; font-weight: 500;">
            ✅ Payment successful! Your subscription is now active.
          </div>
          ` : ''}

          <div class="main-header">
            <h1 id="pageTitle">Dashboard</h1>
            <div class="header-actions">
              ${bots.length > 1 ? `<button class="btn btn-danger" onclick="showDeleteBotModal()">Delete Bot</button>` : ''}
            </div>
          </div>
          
          <div class="main-body">
            <div id="alert-success" class="alert alert-success"></div>
            <div id="alert-error" class="alert alert-error"></div>
            
            <!-- Overview Tab -->
            <div id="tab-overview" class="tab-panel active">
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-card-header"><div class="stat-icon blue"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div></div>
                  <div class="stat-value">${documentCount}</div>
                  <div class="stat-label">Documents</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header"><div class="stat-icon green"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div></div>
                  <div class="stat-value">${leadCount}</div>
                  <div class="stat-label">Leads Captured</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header"><div class="stat-icon purple"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></div></div>
                  <div class="stat-value">${messageCount}</div>
                  <div class="stat-label">Messages</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header"><div class="stat-icon orange"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div></div>
                  <div class="stat-value">${bots.length}</div>
                  <div class="stat-label">Total Bots</div>
                </div>
              </div>
              
              <div class="content-card">
                <div class="content-card-header"><h3>Recent Activity</h3></div>
                <div class="content-card-body">
                  ${messages.length > 0 ? messages.slice(0, 5).map(msg => `
                    <div class="list-item">
                      <div class="list-item-info">
                        <div class="list-item-title">${msg.role === 'user' ? '👤' : '🤖'} ${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}</div>
                        <div class="list-item-meta">${msg.leadName} • ${msg.date}</div>
                      </div>
                      <span class="badge badge-${msg.role === 'user' ? 'blue' : 'green'}">${msg.role}</span>
                    </div>
                  `).join('') : '<p style="color: #64748b; text-align: center; padding: 20px;">No recent activity</p>'}
                </div>
              </div>
            </div>
            
            <!-- Upload Tab -->
            <div id="tab-upload" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Upload Files</h3></div>
                <div class="content-card-body">
                  <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                    <div class="upload-icon"><svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg></div>
                    <div class="upload-title">Click to upload or drag and drop</div>
                    <div class="upload-subtitle">PDF, Word, Text, CSV (max 20MB)</div>
                  </div>
                  <input type="file" id="fileInput" style="display: none;" accept=".pdf,.docx,.txt,.csv" multiple onchange="handleFileUpload(event)">
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Import from Website</h3></div>
                <div class="content-card-body">
                  <div class="toggle-group">
                    <button id="fullWebsiteBtn" class="toggle-btn active" onclick="setWebsiteMode('full')">Full Website</button>
                    <button id="singlePageBtn" class="toggle-btn" onclick="setWebsiteMode('single')">Single Page</button>
                  </div>
                  <div class="form-group"><input type="url" id="websiteUrl" class="form-input" placeholder="https://example.com" /></div>
                  <button class="btn btn-primary" onclick="handleWebsiteScrape()">Start Scraping</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Import from YouTube</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><input type="url" id="youtubeUrl" class="form-input" placeholder="https://www.youtube.com/watch?v=..." /></div>
                  <button class="btn btn-primary" style="background: #dc2626;" onclick="handleYoutubeTranscript()">Extract Transcript</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Add Text Content</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Title</label><input type="text" id="textTitle" class="form-input" placeholder="e.g., Product Information, FAQ" /></div>
                  <div class="form-group"><label class="form-label">Content</label><textarea id="textContent" class="form-input form-textarea" placeholder="Paste your content here..."></textarea></div>
                  <button class="btn btn-primary" onclick="handleTextUpload()">Upload Text</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Add Q&A Pair</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Question</label><input type="text" id="qaQuestion" class="form-input" placeholder="e.g., What are your business hours?" /></div>
                  <div class="form-group"><label class="form-label">Answer</label><textarea id="qaAnswer" class="form-input form-textarea" placeholder="We're open Monday-Friday, 9am-5pm."></textarea></div>
                  <button class="btn btn-primary" onclick="handleQAUpload()">Add Q&A Pair</button>
                </div>
              </div>
            </div>
            
            <!-- Documents Tab -->
            <div id="tab-documents" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header" style="flex-wrap: wrap; gap: 10px;">
                  <h3>Training Documents <span style="font-weight: 400; font-size: 14px; color: #64748b;">(${documents.length})</span></h3>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="retrainSelected()" id="retrainSelectedBtn" style="display:none;"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> Retrain Selected</button>
                    <button class="btn btn-danger" onclick="deleteSelected()" id="deleteSelectedBtn" style="display:none;">Delete Selected</button>
                    <button class="btn btn-secondary" onclick="openRetrainSchedule()"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> Schedule</button>
                  </div>
                </div>
                <div class="content-card-body" style="padding: 0; overflow-x: auto;">
                  ${documents.length > 0 ? `
                  <table style="width: 100%; border-collapse: collapse; min-width: 700px;">
                    <thead>
                      <tr style="border-bottom: 2px solid #e2e8f0; text-align: left;">
                        <th style="padding: 12px 16px; width: 40px;"><input type="checkbox" id="selectAllDocs" onchange="toggleSelectAll(this)" /></th>
                        <th style="padding: 12px 8px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                        <th style="padding: 12px 8px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Chars</th>
                        <th style="padding: 12px 8px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Title / Source</th>
                        <th style="padding: 12px 8px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Date Added</th>
                        <th style="padding: 12px 8px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${documents.map(doc => `
                      <tr style="border-bottom: 1px solid #f1f5f9;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 12px 16px;"><input type="checkbox" class="doc-checkbox" value="${doc.id}" onchange="updateBulkButtons()" /></td>
                        <td style="padding: 12px 8px;"><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%;"></span><span style="font-size: 13px; color: #64748b;">Indexed</span></span></td>
                        <td style="padding: 12px 8px; font-size: 13px; color: #1e293b; font-weight: 500;">${doc.charCount.toLocaleString()}</td>
                        <td style="padding: 12px 8px;"><div style="font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 2px; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${doc.title}</div>${doc.url ? '<a href="' + doc.url + '" target="_blank" style="font-size: 12px; color: #3b82f6; text-decoration: none; word-break: break-all;">' + doc.url.substring(0, 60) + (doc.url.length > 60 ? '...' : '') + '</a>' : ''}</td>
                        <td style="padding: 12px 8px; font-size: 13px; color: #64748b; white-space: nowrap;">${doc.date}</td>
                        <td style="padding: 12px 8px;"><span class="badge badge-${doc.type === 'website' ? 'blue' : doc.type === 'youtube' ? 'green' : 'gray'}">${doc.type}</span></td>
                      </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  ` : '<p style="color: #64748b; text-align: center; padding: 40px;">No documents yet. Upload content to get started.</p>'}
                </div>
              </div>

              <!-- Retrain Schedule Modal -->
              <div id="retrainModal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;">
                <div style="background:white; border-radius:12px; padding:32px; max-width:440px; width:90%; position:relative; margin:auto; margin-top:15vh;">
                  <button onclick="closeRetrainModal()" style="position:absolute; top:12px; right:16px; background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                  <h3 style="margin:0 0 8px 0; font-size:20px;">Retrain Schedule</h3>
                  <p style="color:#64748b; margin:0 0 24px 0; font-size:14px;">Automatically re-scrape all website pages on a schedule to keep your bot up to date.</p>
                  
                  <div style="margin-bottom: 16px;">
                    <label style="display:block; font-weight:600; margin-bottom:6px; font-size:14px;">Frequency</label>
                    <select id="retrainFrequency" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
                      <option value="none">None (manual only)</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  
                  <div style="margin-bottom: 24px;">
                    <label style="display:block; font-weight:600; margin-bottom:6px; font-size:14px;">Time (UTC)</label>
                    <select id="retrainTime" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">
                      <option value="00:00">12:00 AM</option>
                      <option value="01:00">1:00 AM</option>
                      <option value="02:00">2:00 AM</option>
                      <option value="03:00" selected>3:00 AM</option>
                      <option value="04:00">4:00 AM</option>
                      <option value="05:00">5:00 AM</option>
                      <option value="06:00">6:00 AM</option>
                      <option value="12:00">12:00 PM</option>
                      <option value="18:00">6:00 PM</option>
                    </select>
                  </div>
                  
                  <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary" onclick="closeRetrainModal()" style="flex:1;">Cancel</button>
                    <button class="btn btn-primary" onclick="saveRetrainSchedule()" style="flex:1;">Save Schedule</button>
                  </div>
                </div>
              </div>
            </div>
```

**BELOW CONTEXT (keep as-is):**
```
            <!-- Q&A Tab -->
            <div id="tab-qa" class="tab-panel">
```

---

**CHANGE 2 — Replace handleWebsiteScrape function (~line 1151)**

Find:
```
          async function handleWebsiteScrape() { const url = document.getElementById('websiteUrl').value; if (!url) { showError('Please enter a URL'); return; } try { const response = await fetch('/api/content/scrape-website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, url, mode: websiteMode }) }); const data = await response.json(); if (response.ok) showSuccess(data.message || 'Website scraped!'); else showError(data.error || 'Scraping failed'); } catch (error) { showError('Network error'); } }
```

Replace with:
```
          async function handleWebsiteScrape() { const url = document.getElementById('websiteUrl').value; if (!url) { showError('Please enter a URL'); return; } try { const response = await fetch('/api/content/scrape-website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, url, mode: websiteMode }) }); const data = await response.json(); if (response.ok) { if (websiteMode === 'full') { const el = document.getElementById('alert-success'); el.textContent = data.message || 'Crawl started! Refresh to see progress.'; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 8000); } else { showSuccess(data.message || 'Website scraped!'); } } else showError(data.error || 'Scraping failed'); } catch (error) { showError('Network error'); } }
```

---

**CHANGE 3 — Add new functions IMMEDIATELY AFTER the handleWebsiteScrape line (~after line 1151)**

Paste these new lines right after `handleWebsiteScrape` and before `handleYoutubeTranscript`:
```
          function toggleSelectAll(el) { document.querySelectorAll('.doc-checkbox').forEach(cb => { cb.checked = el.checked; }); updateBulkButtons(); }
          function updateBulkButtons() { const checked = document.querySelectorAll('.doc-checkbox:checked'); document.getElementById('retrainSelectedBtn').style.display = checked.length > 0 ? 'inline-flex' : 'none'; document.getElementById('deleteSelectedBtn').style.display = checked.length > 0 ? 'inline-flex' : 'none'; }
          function getSelectedDocIds() { return Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => parseInt(cb.value)); }
          async function retrainSelected() { const ids = getSelectedDocIds(); if (ids.length === 0) return; if (!confirm('Retrain ' + ids.length + ' selected document(s)? Website pages will be re-scraped with fresh content.')) return; try { const response = await fetch('/api/content/retrain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, documentIds: ids }) }); const data = await response.json(); if (response.ok) { const el = document.getElementById('alert-success'); el.textContent = data.message; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 6000); } else showError(data.error || 'Retrain failed'); } catch (error) { showError('Network error'); } }
          async function deleteSelected() { const ids = getSelectedDocIds(); if (ids.length === 0) return; if (!confirm('Delete ' + ids.length + ' selected document(s)? This will remove all training data for these pages.')) return; try { const response = await fetch('/api/content/delete-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, documentIds: ids }) }); const data = await response.json(); if (response.ok) showSuccess(data.message); else showError(data.error || 'Delete failed'); } catch (error) { showError('Network error'); } }
          function openRetrainSchedule() { document.getElementById('retrainModal').style.display = 'flex'; fetch('/api/content/retrain-schedule/' + botId).then(r => r.json()).then(data => { if (data.success) { document.getElementById('retrainFrequency').value = data.frequency || 'none'; document.getElementById('retrainTime').value = data.time || '03:00'; } }).catch(() => {}); }
          function closeRetrainModal() { document.getElementById('retrainModal').style.display = 'none'; }
          async function saveRetrainSchedule() { const frequency = document.getElementById('retrainFrequency').value; const time = document.getElementById('retrainTime').value; try { const response = await fetch('/api/content/retrain-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, frequency, time }) }); const data = await response.json(); if (response.ok) { closeRetrainModal(); showSuccess(data.message); } else showError(data.error || 'Failed to save'); } catch (error) { showError('Network error'); } }
```

**BELOW CONTEXT (this already exists, don't duplicate):**
```
          async function handleYoutubeTranscript() { ...
            
            <!-- Q&A Tab -->
            <div id="tab-qa" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Q&A Training Pairs</h3></div>
                <div class="content-card-body">
                  ${qaPairs.length > 0 ? qaPairs.map(qa => {
                    const lines = qa.content.split('\n').filter(l => l.trim());
                    const question = lines[0]?.replace('Q: ', '') || '';
                    const answer = lines.find(l => l.startsWith('A: '))?.replace('A: ', '') || '';
                    return `
                      <div class="list-item" style="flex-direction: column; align-items: flex-start;">
                        <div style="font-weight: 600; color: #3b82f6; margin-bottom: 8px;">Q: ${question}</div>
                        <div style="color: #374151; line-height: 1.6;">A: ${answer}</div>
                        <div class="list-item-meta" style="margin-top: 8px;">${qa.date}</div>
                      </div>`;
                  }).join('') : '<p style="color: #64748b; text-align: center; padding: 40px;">No Q&A pairs yet. Add some in Upload Content.</p>'}
                </div>
              </div>
            </div>
            
            <!-- Leads Tab -->
            <div id="tab-leads" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Captured Leads</h3></div>
                <div class="content-card-body">
                  ${leads.length > 0 ? leads.map(lead => `
                    <div class="list-item">
                      <div class="list-item-info"><div class="list-item-title">${lead.name}</div><div class="list-item-meta">${lead.email} • ${lead.date}</div></div>
                      <span class="badge badge-green">New</span>
                    </div>
                  `).join('') : '<p style="color: #64748b; text-align: center; padding: 40px;">No leads captured yet.</p>'}
                </div>
              </div>
            </div>
            
            <!-- Messages Tab -->
            <div id="tab-messages" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Chat History</h3></div>
                <div class="content-card-body" style="max-height: 600px; overflow-y: auto;">
                  ${messages.length > 0 ? messages.map(msg => `
                    <div class="message-item ${msg.role}">
                      <div class="message-header"><span class="message-author">${msg.role === 'user' ? '👤 User' : '🤖 Assistant'} • ${msg.leadName}</span><span class="message-time">${msg.date}</span></div>
                      <div class="message-content">${msg.content}</div>
                    </div>
                  `).join('') : '<p style="color: #64748b; text-align: center; padding: 40px;">No messages yet.</p>'}
                </div>
              </div>
            </div>
            
            <!-- Behavior Tab -->
            <div id="tab-behavior" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Bot Instructions</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">System Prompt</label><textarea id="botInstructions" class="form-input form-textarea" style="min-height: 200px;" placeholder="Describe how your bot should behave...">${botInstructions}</textarea><div class="form-help">This tells the AI how to respond - its personality, tone, what it should/shouldn't say.</div></div>
                  <button class="btn btn-primary" onclick="handleBotInstructionsUpdate()">Save Instructions</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Greeting Message</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Welcome Message</label><input type="text" id="greetingMessage" class="form-input" value="${greetingMessage}" placeholder="Thank you for visiting! How may we assist you today?" /><div class="form-help">Shown in the chat bubble when visitors first see the widget.</div></div>
                  <button class="btn btn-primary" onclick="handleGreetingUpdate()">Save Greeting</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Greeting Bubble</h3></div>
                <div class="content-card-body">
                  <div class="form-group">
                    <label class="form-label">Show Greeting Popup</label>
                    <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                      <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="greetingBubbleEnabled" ${greetingBubbleEnabled ? 'checked' : ''} onchange="handleGreetingBubbleToggle()" style="width: 20px; height: 20px; cursor: pointer;" />
                        <span style="margin-left: 8px; font-weight: 500;">Show greeting message bubble on page load</span>
                      </label>
                    </div>
                    <div class="form-help">When enabled, the greeting message appears in a popup bubble above the chat button when visitors first load the page. It auto-hides after 10 seconds.</div>
                  </div>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Lead Capture</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Collect Visitor Information</label><div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;"><label style="display: flex; align-items: center; cursor: pointer;"><input type="checkbox" id="leadCaptureEnabled" ${leadCaptureEnabled ? 'checked' : ''} onchange="handleLeadCaptureToggle()" style="width: 20px; height: 20px; cursor: pointer;" /><span style="margin-left: 8px; font-weight: 500;">Enable lead capture form</span></label></div><div class="form-help">When enabled, visitors are asked for their name and email after the first message exchange.</div></div>
                  <div class="form-group"><label class="form-label">Lead Form Message</label><textarea id="leadFormMessage" class="form-input form-textarea" style="min-height: 80px;" placeholder="Want personalized help? Leave your details and we'll follow up">${leadFormMessage}</textarea><div class="form-help">The message shown above the lead capture form.</div></div>
                  <button class="btn btn-primary" onclick="handleLeadFormMessageUpdate()">Save Lead Form Message</button>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Conversation Notifications</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Email Conversation Transcripts</label><div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;"><label style="display: flex; align-items: center; cursor: pointer;"><input type="checkbox" id="conversationNotifications" ${conversationNotifications ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;" /><span style="margin-left: 8px; font-weight: 500;">Send conversation transcripts via email</span></label></div><div class="form-help">When enabled, full conversation transcripts are emailed after 1 minute of inactivity.</div></div>
                  <div class="form-group"><label class="form-label">Notification Email(s)</label><input type="text" id="notificationEmails" class="form-input" value="${notificationEmails}" placeholder="email@example.com, another@example.com" /><div class="form-help">Comma-separated list of email addresses to receive conversation transcripts.</div></div>
                  <button class="btn btn-primary" onclick="handleNotificationSettingsUpdate()">Save Notification Settings</button>
                </div>
              </div>
            </div>
            
            <!-- Appearance Tab -->
            <div id="tab-appearance" class="tab-panel">
              <div class="content-card">
                <div class="content-card-header"><h3>Chat Button</h3></div>
                <div class="content-card-body">
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group"><label class="form-label">Button Style</label><div style="display: flex; gap: 8px;"><button type="button" id="styleCircle" class="btn ${buttonStyle === 'circle' ? 'btn-primary' : 'btn-secondary'}" onclick="setButtonStyle('circle')" style="padding: 8px 16px;">Circle</button><button type="button" id="styleBar" class="btn ${buttonStyle === 'bar' ? 'btn-primary' : 'btn-secondary'}" onclick="setButtonStyle('bar')" style="padding: 8px 16px;">Bar</button></div><input type="hidden" id="buttonStyle" value="${buttonStyle}" /></div>
                    <div class="form-group"><label class="form-label">Button Position</label><div style="display: flex; gap: 8px;"><button type="button" id="posLeft" class="btn ${buttonPosition === 'left' ? 'btn-primary' : 'btn-secondary'}" onclick="setButtonPosition('left')" style="padding: 8px 16px;">Left</button><button type="button" id="posRight" class="btn ${buttonPosition === 'right' ? 'btn-primary' : 'btn-secondary'}" onclick="setButtonPosition('right')" style="padding: 8px 16px;">Right</button></div><input type="hidden" id="buttonPosition" value="${buttonPosition}" /></div>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
                    <div class="form-group"><label class="form-label">Button Size: <span id="sizeValue">${buttonSize}px</span></label><input type="range" id="buttonSize" min="50" max="96" value="${buttonSize}" oninput="document.getElementById('sizeValue').textContent = this.value + 'px'; updatePreview();" style="width: 100%;" /></div>
                    <div class="form-group"><label class="form-label">Bar Message</label><input type="text" id="barMessage" class="form-input" value="${barMessage}" placeholder="Chat Now" oninput="updatePreview()" /></div>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
                    <div class="form-group"><label class="form-label">Chat Bubble Background</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="chatBubbleBg" value="${chatBubbleBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="chatBubbleBgText" class="form-input" value="${chatBubbleBg}" style="width: 100px;" onchange="document.getElementById('chatBubbleBg').value = this.value; updatePreview();" /></div></div>
                    <div class="form-group"><label class="form-label">Avatar Background</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="avatarBg" value="${avatarBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="avatarBgText" class="form-input" value="${avatarBg}" style="width: 100px;" onchange="document.getElementById('avatarBg').value = this.value; updatePreview();" /></div></div>
                  </div>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Chat Window</h3></div>
                <div class="content-card-body">
                  <div class="form-group"><label class="form-label">Header Title</label><input type="text" id="headerTitle" class="form-input" value="${headerTitle}" placeholder="Support Assistant" oninput="updatePreview()" /></div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
                    <div class="form-group"><label class="form-label">Header Color</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="headerColor" value="${headerColor}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="headerColorText" class="form-input" value="${headerColor}" style="width: 100px;" onchange="document.getElementById('headerColor').value = this.value; updatePreview();" /></div></div>
                    <div class="form-group"><label class="form-label">Header Text Color</label><div style="display: flex; gap: 8px;"><button type="button" id="textWhite" class="btn ${textColor === '#ffffff' ? 'btn-primary' : 'btn-secondary'}" onclick="setTextColor('#ffffff')" style="padding: 8px 16px;">White</button><button type="button" id="textBlack" class="btn ${textColor === '#000000' ? 'btn-primary' : 'btn-secondary'}" onclick="setTextColor('#000000')" style="padding: 8px 16px;">Black</button></div><input type="hidden" id="textColor" value="${textColor}" /></div>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
                    <div class="form-group"><label class="form-label">Chat Window Background</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="chatWindowBg" value="${chatWindowBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="chatWindowBgText" class="form-input" value="${chatWindowBg}" style="width: 100px;" onchange="document.getElementById('chatWindowBg').value = this.value; updatePreview();" /></div></div>
                    <div class="form-group"><label class="form-label">Send Button Color</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="sendButtonBg" value="${sendButtonBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="sendButtonBgText" class="form-input" value="${sendButtonBg}" style="width: 100px;" onchange="document.getElementById('sendButtonBg').value = this.value; updatePreview();" /></div></div>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
                    <div class="form-group"><label class="form-label">User Message Background</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="userMessageBg" value="${userMessageBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="userMessageBgText" class="form-input" value="${userMessageBg}" style="width: 100px;" onchange="document.getElementById('userMessageBg').value = this.value; updatePreview();" /></div></div>
                    <div class="form-group"><label class="form-label">Bot Message Background</label><div style="display: flex; gap: 12px; align-items: center;"><input type="color" id="botMessageBg" value="${botMessageBg}" style="width: 60px; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;" oninput="updatePreview()" /><input type="text" id="botMessageBgText" class="form-input" value="${botMessageBg}" style="width: 100px;" onchange="document.getElementById('botMessageBg').value = this.value; updatePreview();" /></div></div>
                  </div>
                </div>
              </div>
              <div class="content-card">
                <div class="content-card-header"><h3>Preview</h3></div>
                <div class="content-card-body">
                  <div style="display: flex; gap: 40px; align-items: flex-start;">
                    <div>
                      <label class="form-label" style="margin-bottom: 12px;">Chat Button</label>
                      <div id="previewButton" style="display: inline-flex; align-items: center; justify-content: center; background: ${chatBubbleBg}; border-radius: 50%; width: ${buttonSize}px; height: ${buttonSize}px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"><svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div>
                      <div id="previewBarButton" style="display: none; align-items: center; gap: 8px; background: ${chatBubbleBg}; color: white; padding: 12px 20px; border-radius: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"><svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg><span id="previewBarText">${barMessage}</span></div>
                    </div>
                    <div>
                      <label class="form-label" style="margin-bottom: 12px;">Chat Window</label>
                      <div id="previewWidget" style="width: 320px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        <div id="previewHeader" style="background: ${headerColor}; color: ${textColor}; padding: 16px;"><div style="font-weight: 600;" id="previewTitle">${headerTitle}</div></div>
                        <div id="previewMessages" style="background: ${chatWindowBg}; padding: 16px; min-height: 120px;"><div id="previewBotMsg" style="background: ${botMessageBg}; color: #1f2937; padding: 10px 14px; border-radius: 12px; margin-bottom: 10px; max-width: 80%;">Hi! How can I help you today?</div><div id="previewUserMsg" style="background: ${userMessageBg}; color: white; padding: 10px 14px; border-radius: 12px; margin-left: auto; max-width: 80%; text-align: right;">I have a question</div></div>
                        <div style="background: white; padding: 12px; border-top: 1px solid #e5e7eb;"><div style="display: flex; gap: 8px;"><div style="flex: 1; padding: 10px 14px; background: #f1f5f9; border-radius: 8px; color: #94a3b8; font-size: 14px;">Ask a question...</div><div id="previewSendBtn" style="background: ${sendButtonBg}; color: white; padding: 10px 14px; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></div></div><div style="text-align: center; margin-top: 8px;"><span style="font-size: 11px; color: #9ca3af;">Powered by AutoReplyChat</span></div></div>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-primary" style="margin-top: 24px;" onclick="handleAppearanceUpdate()">Save Appearance</button>
                </div>
              </div>
            </div>
            
            <!-- Deploy Tab -->
            <div id="tab-deploy" class="tab-panel">
              <div class="embed-section"><h4>🔗 Direct Link</h4><p>Share this link to let users access your chatbot directly.</p><div class="copy-row"><input type="text" class="copy-input" readonly value="https://autoreplychat.com/chat/${publicId}" onclick="this.select()" /><button class="btn btn-primary" onclick="copyToClipboard('https://autoreplychat.com/chat/${publicId}')">Copy</button></div></div>
              <div class="embed-section"><h4>📜 Website Script</h4><p>Add this code to the header of your website to display the chatbot on all pages.</p><div class="code-block">&lt;script defer src="https://autoreplychat.com/embed.js" data-bot-id="${publicId}"&gt;&lt;/script&gt;</div><button class="btn btn-secondary" style="margin-top: 12px;" onclick="copyEmbed('script')">Copy Code</button></div>
              <div class="embed-section"><h4>🖼️ Iframe Embed</h4><p>Embed the chatbot directly into your page layout.</p><div class="code-block">&lt;iframe src="https://autoreplychat.com/chat/${publicId}" style="width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"&gt;&lt;/iframe&gt;</div><button class="btn btn-secondary" style="margin-top: 12px;" onclick="copyEmbed('iframe')">Copy Code</button></div>
              <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Bot ID: <strong>${publicId}</strong></p>
            </div>
          </div>
        </div>
        
        <!-- Create Bot Modal -->
        <div id="createBotModal" class="modal-overlay"><div class="modal"><h3>Create New Bot</h3><p>Give your new chatbot a name to get started.</p><div class="form-group"><label class="form-label">Bot Name</label><input type="text" id="newBotName" class="form-input" placeholder="e.g., Support Bot, Sales Assistant" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="hideCreateBotModal()">Cancel</button><button class="btn btn-primary" onclick="createBot()">Create Bot</button></div></div></div>
        
        <!-- Delete Bot Modal -->
        <div id="deleteBotModal" class="modal-overlay"><div class="modal"><h3>Delete "${currentBot.name}"?</h3><p>This will permanently delete all documents, leads, and messages associated with this bot. This action cannot be undone.</p><div class="modal-actions"><button class="btn btn-secondary" onclick="hideDeleteBotModal()">Cancel</button><button class="btn btn-danger" onclick="deleteBot()">Delete Bot</button></div></div></div>
        
        <script>
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) { options.credentials = 'include'; return originalFetch(url, options); };
          const customerId = '${customerId}';
          const botId = '${botId}';
          const publicId = '${publicId}';
          let websiteMode = 'full';
          let activeTab = 'overview';
          const tabTitles = { overview:'Dashboard', upload:'Upload Content', documents:'Documents', qa:'Q&A Pairs', leads:'Leads', messages:'Messages', behavior:'Bot Behavior', appearance:'Appearance', deploy:'Deploy' };
          
          function switchTab(tab) { document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active')); document.getElementById('tab-' + tab).classList.add('active'); event.target.closest('.nav-item').classList.add('active'); document.getElementById('pageTitle').textContent = tabTitles[tab] || 'Dashboard'; activeTab = tab; }
          function switchBot(newBotId) { window.location.href = '/api/dashboard/${customerId}?bot=' + newBotId; }
          function showCreateBotModal() { document.getElementById('createBotModal').classList.add('show'); }
          function hideCreateBotModal() { document.getElementById('createBotModal').classList.remove('show'); }
          function showDeleteBotModal() { document.getElementById('deleteBotModal').classList.add('show'); }
          function hideDeleteBotModal() { document.getElementById('deleteBotModal').classList.remove('show'); }
          function showSuccess(message) { const el = document.getElementById('alert-success'); el.textContent = message; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; location.reload(); }, 2000); }
          function showError(message) { const el = document.getElementById('alert-error'); el.textContent = message; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 5000); }
          function logout() { fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location = '/login'); }
          function setWebsiteMode(mode) { websiteMode = mode; document.getElementById('fullWebsiteBtn').classList.toggle('active', mode === 'full'); document.getElementById('singlePageBtn').classList.toggle('active', mode === 'single'); }
          function copyToClipboard(text) { navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Failed to copy')); }
          function copyEmbed(type) { let text = ''; if (type === 'script') { text = \`<script defer src="https://autoreplychat.com/embed.js" data-bot-id="\${publicId}"><\\/script>\`; } else if (type === 'iframe') { text = \`<iframe src="https://autoreplychat.com/chat/\${publicId}" style="width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></iframe>\`; } navigator.clipboard.writeText(text).then(() => alert('Code copied!')).catch(() => alert('Failed to copy')); }
          
          async function handleUpgrade() { try { const response = await fetch('/api/stripe/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); const data = await response.json(); if (data.url) window.location.href = data.url; } catch (error) { showError('Failed to start checkout'); } }
          async function openBillingPortal() { try { const response = await fetch('/api/stripe/create-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); const data = await response.json(); if (data.url) window.location.href = data.url; } catch (error) { showError('Failed to open billing portal'); } }
          
          async function createBot() { const name = document.getElementById('newBotName').value.trim(); if (!name) { showError('Please enter a bot name'); return; } try { const response = await fetch('/api/bots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, name }) }); const data = await response.json(); if (response.ok) window.location.href = '/api/dashboard/${customerId}?bot=' + data.botId; else showError(data.error || 'Failed to create bot'); } catch (error) { showError('Network error'); } }
          async function deleteBot() { try { const response = await fetch('/api/bots/' + botId, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId }) }); if (response.ok) window.location.href = '/api/dashboard/${customerId}'; else { const data = await response.json(); showError(data.error || 'Failed to delete bot'); } } catch (error) { showError('Network error'); } }
          async function handleFileUpload(event) { const files = event.target.files; const formData = new FormData(); for (let file of files) formData.append('files', file); formData.append('customerId', customerId); formData.append('botId', botId); try { const response = await fetch('/api/content/upload', { method: 'POST', body: formData }); const data = await response.json(); if (response.ok) showSuccess(data.message || 'Files uploaded!'); else showError(data.error || 'Upload failed'); } catch (error) { showError('Network error'); } }
          async function handleWebsiteScrape() { const url = document.getElementById('websiteUrl').value; if (!url) { showError('Please enter a URL'); return; } try { const response = await fetch('/api/content/scrape-website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, url, mode: websiteMode }) }); const data = await response.json(); if (response.ok) showSuccess(data.message || 'Website scraped!'); else showError(data.error || 'Scraping failed'); } catch (error) { showError('Network error'); } }
          async function handleYoutubeTranscript() { const url = document.getElementById('youtubeUrl').value; if (!url) { showError('Please enter a YouTube URL'); return; } try { const response = await fetch('/api/content/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, url }) }); const data = await response.json(); if (response.ok) showSuccess(data.message || 'Transcript extracted!'); else showError(data.error || 'Extraction failed'); } catch (error) { showError('Network error'); } }
          async function handleTextUpload() { const title = document.getElementById('textTitle').value; const content = document.getElementById('textContent').value; if (!title || !content) { showError('Please fill in title and content'); return; } try { const response = await fetch('/api/content/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, title, content }) }); const data = await response.json(); if (response.ok) { showSuccess(data.message || 'Text uploaded!'); document.getElementById('textTitle').value = ''; document.getElementById('textContent').value = ''; } else showError(data.error || 'Upload failed'); } catch (error) { showError('Network error'); } }
          async function handleQAUpload() { const question = document.getElementById('qaQuestion').value; const answer = document.getElementById('qaAnswer').value; if (!question || !answer) { showError('Please fill in question and answer'); return; } const content = 'Q: ' + question + '\\n\\nA: ' + answer; const title = 'Q&A: ' + question.substring(0, 50) + (question.length > 50 ? '...' : ''); try { const response = await fetch('/api/content/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, botId, title, content }) }); const data = await response.json(); if (response.ok) { showSuccess('Q&A pair added!'); document.getElementById('qaQuestion').value = ''; document.getElementById('qaAnswer').value = ''; } else showError(data.error || 'Failed to add'); } catch (error) { showError('Network error'); } }
          async function handleBotInstructionsUpdate() { const instructions = document.getElementById('botInstructions').value; try { const response = await fetch('/api/bots/' + botId + '/instructions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, instructions }) }); if (response.ok) showSuccess('Instructions saved!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          async function handleGreetingUpdate() { const greeting = document.getElementById('greetingMessage').value; try { const response = await fetch('/api/bots/' + botId + '/greeting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, greeting }) }); if (response.ok) showSuccess('Greeting saved!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          async function handleGreetingBubbleToggle() { const enabled = document.getElementById('greetingBubbleEnabled').checked; try { const response = await fetch('/api/bots/' + botId + '/greeting-bubble', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, enabled }) }); if (response.ok) showSuccess(enabled ? 'Greeting bubble enabled!' : 'Greeting bubble disabled!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          async function handleLeadCaptureToggle() { const enabled = document.getElementById('leadCaptureEnabled').checked; try { const response = await fetch('/api/bots/' + botId + '/lead-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, enabled }) }); if (response.ok) showSuccess(enabled ? 'Lead capture enabled!' : 'Lead capture disabled!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          async function handleLeadFormMessageUpdate() { const message = document.getElementById('leadFormMessage').value; try { const response = await fetch('/api/bots/' + botId + '/lead-form-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, message }) }); if (response.ok) showSuccess('Lead form message saved!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          async function handleNotificationSettingsUpdate() { const enabled = document.getElementById('conversationNotifications').checked; const emails = document.getElementById('notificationEmails').value; if (enabled && !emails.trim()) { showError('Please enter at least one email address'); return; } try { const response = await fetch('/api/bots/' + botId + '/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, enabled, emails }) }); if (response.ok) showSuccess('Notification settings saved!'); else showError('Failed to save'); } catch (error) { showError('Network error'); } }
          
          function setTextColor(color) { document.getElementById('textColor').value = color; document.getElementById('textWhite').className = color === '#ffffff' ? 'btn btn-primary' : 'btn btn-secondary'; document.getElementById('textBlack').className = color === '#000000' ? 'btn btn-primary' : 'btn btn-secondary'; updatePreview(); }
          function setButtonStyle(style) { document.getElementById('buttonStyle').value = style; document.getElementById('styleCircle').className = style === 'circle' ? 'btn btn-primary' : 'btn btn-secondary'; document.getElementById('styleBar').className = style === 'bar' ? 'btn btn-primary' : 'btn btn-secondary'; updatePreview(); }
          function setButtonPosition(pos) { document.getElementById('buttonPosition').value = pos; document.getElementById('posLeft').className = pos === 'left' ? 'btn btn-primary' : 'btn btn-secondary'; document.getElementById('posRight').className = pos === 'right' ? 'btn btn-primary' : 'btn btn-secondary'; updatePreview(); }
          
          function updatePreview() {
            const hc = document.getElementById('headerColor')?.value || '#3b82f6'; const tc = document.getElementById('textColor')?.value || '#ffffff'; const ht = document.getElementById('headerTitle')?.value || 'Support Assistant'; const cb = document.getElementById('chatBubbleBg')?.value || '#3b82f6'; const cw = document.getElementById('chatWindowBg')?.value || '#ffffff'; const um = document.getElementById('userMessageBg')?.value || '#3b82f6'; const bm = document.getElementById('botMessageBg')?.value || '#f3f4f6'; const sb = document.getElementById('sendButtonBg')?.value || '#3b82f6'; const bs = document.getElementById('buttonStyle')?.value || 'circle'; const bsz = document.getElementById('buttonSize')?.value || 60; const bmsg = document.getElementById('barMessage')?.value || 'Chat Now';
            const ph = document.getElementById('previewHeader'); if(ph){ph.style.background=hc;ph.style.color=tc;} const pt = document.getElementById('previewTitle'); if(pt)pt.textContent=ht;
            const pb = document.getElementById('previewButton'); const pbb = document.getElementById('previewBarButton'); if(pb&&pbb){if(bs==='circle'){pb.style.display='inline-flex';pbb.style.display='none';pb.style.background=cb;pb.style.width=bsz+'px';pb.style.height=bsz+'px';}else{pb.style.display='none';pbb.style.display='inline-flex';pbb.style.background=cb;}}
            const pbt = document.getElementById('previewBarText'); if(pbt)pbt.textContent=bmsg;
            const pm = document.getElementById('previewMessages'); if(pm)pm.style.background=cw; const pum = document.getElementById('previewUserMsg'); if(pum)pum.style.background=um; const pbm = document.getElementById('previewBotMsg'); if(pbm)pbm.style.background=bm; const psb = document.getElementById('previewSendBtn'); if(psb)psb.style.background=sb;
          }
          
          ['headerColor','chatBubbleBg','chatWindowBg','userMessageBg','botMessageBg','sendButtonBg','avatarBg'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('input', function(){ const txt = document.getElementById(id+'Text'); if(txt) txt.value = this.value; updatePreview(); }); });
          
          async function handleAppearanceUpdate() {
            const data = { customerId, headerTitle: document.getElementById('headerTitle')?.value||'Support Assistant', headerColor: document.getElementById('headerColor')?.value||'#3b82f6', textColor: document.getElementById('textColor')?.value||'#ffffff', chatBubbleBg: document.getElementById('chatBubbleBg')?.value||'#3b82f6', avatarBg: document.getElementById('avatarBg')?.value||'#e0e0e0', buttonStyle: document.getElementById('buttonStyle')?.value||'circle', buttonPosition: document.getElementById('buttonPosition')?.value||'right', buttonSize: parseInt(document.getElementById('buttonSize')?.value)||60, barMessage: document.getElementById('barMessage')?.value||'Chat Now', chatWindowBg: document.getElementById('chatWindowBg')?.value||'#ffffff', userMessageBg: document.getElementById('userMessageBg')?.value||'#3b82f6', botMessageBg: document.getElementById('botMessageBg')?.value||'#f3f4f6', sendButtonBg: document.getElementById('sendButtonBg')?.value||'#3b82f6' };
            try { const response = await fetch('/api/bots/' + botId + '/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (response.ok) showSuccess('Appearance saved!'); else showError('Failed to save'); } catch (error) { showError('Network error'); }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;
