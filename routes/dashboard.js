import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

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
    
    // Get customer info
    const customerResult = await query(
      'SELECT name, email, bot_instructions FROM customers WHERE id = $1',
      [customerId]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).send('Customer not found');
    }
    
    const customer = customerResult.rows[0];
    const botInstructions = customer.bot_instructions || '';
    
    // Get document count
    const docCountResult = await query(
      'SELECT COUNT(*) as count FROM documents WHERE customer_id = $1',
      [customerId]
    );
    const documentCount = parseInt(docCountResult.rows[0].count);
    
    // Get lead count
    const leadCountResult = await query(
      'SELECT COUNT(*) as count FROM leads WHERE customer_id = $1',
      [customerId]
    );
    const leadCount = parseInt(leadCountResult.rows[0].count);
    
    // Get recent documents (non Q&A)
    const documentsResult = await query(
      `SELECT id, title, content_type, created_at 
       FROM documents 
       WHERE customer_id = $1 AND (title NOT LIKE 'Q&A:%' OR title IS NULL)
       ORDER BY created_at DESC 
       LIMIT 10`,
      [customerId]
    );
    
    const documents = documentsResult.rows.map(doc => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      type: doc.content_type,
      date: new Date(doc.created_at).toLocaleDateString()
    }));
    
    // Get Q&A pairs specifically
    const qaPairsResult = await query(
      `SELECT id, title, content, created_at 
       FROM documents 
       WHERE customer_id = $1 AND title LIKE 'Q&A:%'
       ORDER BY created_at DESC`,
      [customerId]
    );
    
    const qaPairs = qaPairsResult.rows.map(doc => ({
      id: doc.id,
      title: doc.title.replace('Q&A: ', ''),
      content: doc.content,
      date: new Date(doc.created_at).toLocaleDateString()
    }));
    
    // Get recent leads
    const leadsResult = await query(
      `SELECT id, name, email, created_at 
       FROM leads 
       WHERE customer_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [customerId]
    );
    
    const leads = leadsResult.rows.map(lead => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      date: new Date(lead.created_at).toLocaleDateString()
    }));

    // Render dashboard HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Auto Reply Chat Dashboard</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f3f4f6;
          }
          
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          
          .header h1 { font-size: 24px; }
          .header p { opacity: 0.9; margin-top: 5px; }
          
          .container { max-width: 1200px; margin: 0 auto; padding: 30px 20px; }
          
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          
          .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .stat-card h3 { color: #6b7280; font-size: 14px; margin-bottom: 10px; }
          .stat-card .number { font-size: 36px; font-weight: bold; color: #1f2937; }
          
          .tabs {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .tab-buttons {
            display: flex;
            border-bottom: 1px solid #e5e7eb;
            overflow-x: auto;
          }
          
          .tab-button {
            flex: 0 0 auto;
            padding: 15px 20px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #6b7280;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            white-space: nowrap;
          }
          
          .tab-button:hover { background: #f9fafb; }
          
          .tab-button.active {
            color: #667eea;
            border-bottom-color: #667eea;
          }
          
          .tab-content {
            padding: 20px;
            display: none;
          }
          
          .tab-content.active { display: block; }
          
          .upload-area {
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            margin-bottom: 20px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .upload-area:hover {
            border-color: #667eea;
            background: #f9fafb;
          }
          
          .form-group {
            margin-bottom: 20px;
          }
          
          label {
            display: block;
            font-weight: 500;
            margin-bottom: 8px;
            color: #374151;
          }
          
          input, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
          }
          
          textarea { min-height: 150px; resize: vertical; }
          
          button {
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }
          
          button:hover { background: #5568d3; }
          
          .document-list, .lead-list {
            list-style: none;
          }
          
          .document-item, .lead-item {
            padding: 15px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .document-item:last-child, .lead-item:last-child { border-bottom: none; }
          
          .document-title { font-weight: 500; color: #1f2937; }
          .document-meta { font-size: 13px; color: #6b7280; margin-top: 4px; }
          
          .qa-item {
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
            margin-bottom: 10px;
            border-radius: 8px;
          }
          
          .qa-question {
            font-weight: 600;
            color: #667eea;
            font-size: 16px;
            margin-bottom: 12px;
          }
          
          .qa-answer {
            color: #1f2937;
            line-height: 1.6;
            padding-left: 20px;
            margin-bottom: 12px;
          }
          
          /* Download Buttons Styling */
          .download-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          
          .download-btn {
            background: #1e3a8a;
            color: white;
            padding: 6px 14px;
            border: none;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
          }
          
          .download-btn:hover {
            background: #1e40af;
            transform: translateY(-1px);
          }
          
          .download-btn.youtube {
            background: #FF0000;
          }
          
          .download-btn.youtube:hover {
            background: #cc0000;
          }
          
          .download-btn.pdf {
            background: #1e3a8a;
          }
          
          .download-btn.word {
            background: #2563eb;
          }
          
          .download-btn.csv {
            background: #10b981;
          }
          
          .success-message {
            background: #d1fae5;
            color: #065f46;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
          }
          
          .error-message {
            background: #fee2e2;
            color: #991b1b;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
          }
          
          .website-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
          }
          
          .website-controls button {
            flex: 0 0 auto;
            padding: 10px 20px;
          }
          
          .website-controls button.active {
            background: #10b981;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🤖 Auto Reply Chat Dashboard</h1>
          <p>Welcome back, ${customer.name}!</p>
        </div>
        
        <div class="container">
          <div class="stats">
            <div class="stat-card">
              <h3>Documents</h3>
              <div class="number">${documentCount}</div>
            </div>
            <div class="stat-card">
              <h3>Leads Captured</h3>
              <div class="number">${leadCount}</div>
            </div>
          </div>
          
          <div class="tabs">
            <div class="tab-buttons">
              <button class="tab-button active" onclick="switchTab('upload')">Upload Content</button>
              <button class="tab-button" onclick="switchTab('documents')">My Documents</button>
              <button class="tab-button" onclick="switchTab('qa')">Q&A Pairs</button>
              <button class="tab-button" onclick="switchTab('leads')">Leads</button>
              <button class="tab-button" onclick="switchTab('embed')">Embed Code</button>
            </div>
            
            <!-- Upload Content Tab -->
            <div id="upload-tab" class="tab-content active">
              <h2 style="margin-bottom: 20px;">Upload Training Content</h2>
              <p style="color: #6b7280; margin-bottom: 20px;">Add content for your chatbot to learn from. The more context you provide, the better it will answer questions.</p>
              
              <div id="success-message" class="success-message"></div>
              <div id="error-message" class="error-message"></div>
              
              <h3 style="margin-bottom: 15px;">Upload Files</h3>
              <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                <p><strong>Click to browse</strong> or drag and drop files here</p>
                <p style="color: #6b7280; font-size: 13px; margin-top: 8px;">Supports: PDF, Word (.docx), Text (.txt), CSV</p>
                <p style="color: #6b7280; font-size: 13px;">Max file size: 20MB</p>
              </div>
              <input type="file" id="fileInput" style="display: none;" accept=".pdf,.docx,.txt,.csv" multiple onchange="handleFileUpload(event)">
              
              <h3 style="margin: 30px 0 15px;">Train from Website</h3>
              <p style="color: #6b7280; margin-bottom: 15px;">Enter a website URL and choose how to scrape it.</p>
              <div class="website-controls">
                <button id="fullWebsiteBtn" class="active" onclick="setWebsiteMode('full')">Full Website</button>
                <button id="singlePageBtn" onclick="setWebsiteMode('single')">Single Page</button>
              </div>
              <div class="form-group">
                <input type="url" id="websiteUrl" placeholder="https://example.com" />
              </div>
              <button onclick="handleWebsiteScrape()">Start Scraping</button>
              
              <h3 style="margin: 30px 0 15px;">Train from YouTube</h3>
              <p style="color: #6b7280; margin-bottom: 15px;">Extract transcript from any YouTube video with captions.</p>
              <div class="form-group">
                <input type="url" id="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <button style="background: #FF0000;" onmouseover="this.style.background='#cc0000'" onmouseout="this.style.background='#FF0000'" onclick="handleYoutubeTranscript()">Extract Transcript</button>
              
              <h3 style="margin: 30px 0 15px;">Or Paste Text</h3>
              <div class="form-group">
                <label for="textTitle">Document title (e.g., "Product Information", "FAQ")</label>
                <input type="text" id="textTitle" placeholder="Product Information" />
              </div>
              <div class="form-group">
                <label for="textContent">Paste your content here...</label>
                <textarea id="textContent" placeholder="Examples:
- Company information
- Product/service descriptions
- Pricing information
- FAQ
- Contact information"></textarea>
              </div>
              <button onclick="handleTextUpload()">Upload Text</button>
              
              <h3 style="margin: 30px 0 15px;">Train with Q&A Pairs</h3>
              <p style="color: #6b7280; margin-bottom: 15px;">Add specific question-answer pairs to train your chatbot on exact responses.</p>
              <div class="form-group">
                <label for="qaQuestion">Question</label>
                <input type="text" id="qaQuestion" placeholder="e.g., What are your business hours?" />
              </div>
              <div class="form-group">
                <label for="qaAnswer">Answer</label>
                <textarea id="qaAnswer" placeholder="We're open Monday-Friday, 9am-5pm EST."></textarea>
              </div>
              <button onclick="handleQAUpload()">Add Q&A Pair</button>
              
              <h3 style="margin: 30px 0 15px;">Configure Bot Behavior</h3>
              <p style="color: #6b7280; margin-bottom: 15px;">Set instructions for how your chatbot should respond - its tone, personality, who it represents, and any specific guidelines.</p>
              <div class="form-group">
                <label for="botInstructions">Bot Instructions</label>
                <textarea id="botInstructions" style="min-height: 200px;" placeholder="Example:
You are a friendly customer support assistant for XYZ Company.

- Always be professional but warm
- Answer questions about our products and services
- If you don't know something, direct them to contact us at support@xyz.com
- Use a helpful, conversational tone
- Keep responses concise (2-3 paragraphs max)">${botInstructions}</textarea>
              </div>
              <button onclick="handleBotInstructionsUpdate()">Save Bot Instructions</button>
            </div>
            
            <!-- My Documents Tab -->
            <div id="documents-tab" class="tab-content">
              <h2 style="margin-bottom: 20px;">My Documents</h2>
              ${documents.length > 0 ? `
                <ul class="document-list">
                  ${documents.map(doc => `
                    <li class="document-item">
                      <div>
                        <div class="document-title">${doc.title}</div>
                        <div class="document-meta">${doc.type} • ${doc.date}</div>
                      </div>
                      <div class="download-buttons">
                        <button class="download-btn pdf" onclick="downloadDocument(${doc.id}, 'pdf')">PDF</button>
                        <button class="download-btn word" onclick="downloadDocument(${doc.id}, 'docx')">Word Doc</button>
                        <button class="download-btn csv" onclick="downloadDocument(${doc.id}, 'csv')">Excel/Csv</button>
                        <button class="download-btn youtube" onclick="downloadDocument(${doc.id}, 'txt')">Youtube</button>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p style="color: #6b7280;">No documents yet. Upload some content to get started!</p>'}
            </div>
            
            <!-- Q&A Pairs Tab -->
            <div id="qa-tab" class="tab-content">
              <h2 style="margin-bottom: 20px;">Q&A Training Pairs</h2>
              ${qaPairs.length > 0 ? `
                <div style="max-height: 600px; overflow-y: auto;">
                  ${qaPairs.map(qa => {
                    const lines = qa.content.split('\n').filter(l => l.trim());
                    const question = lines[0]?.replace('Q: ', '') || '';
                    const answer = lines.find(l => l.startsWith('A: '))?.replace('A: ', '') || '';
                    
                    return `
                      <div class="qa-item">
                        <div class="qa-question">Q: ${question}</div>
                        <div class="qa-answer">A: ${answer}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                          <div class="document-meta">${qa.date}</div>
                          <div class="download-buttons">
                            <button class="download-btn pdf" onclick="downloadDocument(${qa.id}, 'pdf')">PDF</button>
                            <button class="download-btn word" onclick="downloadDocument(${qa.id}, 'docx')">Word</button>
                            <button class="download-btn csv" onclick="downloadDocument(${qa.id}, 'csv')">CSV</button>
                            <button class="download-btn youtube" onclick="downloadDocument(${qa.id}, 'txt')">TXT</button>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : '<p style="color: #6b7280;">No Q&A pairs yet. Add some in the Upload Content tab!</p>'}
            </div>
            
            <!-- Leads Tab -->
            <div id="leads-tab" class="tab-content">
              <h2 style="margin-bottom: 20px;">Captured Leads</h2>
              ${leads.length > 0 ? `
                <ul class="lead-list">
                  ${leads.map(lead => `
                    <li class="lead-item">
                      <div>
                        <div class="document-title">${lead.name}</div>
                        <div class="document-meta">${lead.email} • ${lead.date}</div>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p style="color: #6b7280;">No leads captured yet.</p>'}
            </div>
            
            <!-- Embed Code Tab -->
            <div id="embed-tab" class="tab-content">
              <h2 style="margin-bottom: 20px;">Embed Your Chatbot</h2>
              <p style="color: #6b7280; margin-bottom: 20px;">Copy this code and paste it before the closing &lt;/body&gt; tag on your website.</p>
              <textarea readonly style="font-family: monospace; background: #f9fafb;" onclick="this.select()">
&lt;script&gt;
  (function() {
    var script = document.createElement('script');
    script.src = 'https://autoreplychat.com/embed.js';
    script.setAttribute('data-customer-id', '${customerId}');
    document.body.appendChild(script);
  })();
&lt;/script&gt;</textarea>
            </div>
          </div>
        </div>
        
        <script>
          let websiteMode = 'full';
          
          function switchTab(tab) {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tab + '-tab').classList.add('active');
          }
          
          function setWebsiteMode(mode) {
            websiteMode = mode;
            document.getElementById('fullWebsiteBtn').classList.toggle('active', mode === 'full');
            document.getElementById('singlePageBtn').classList.toggle('active', mode === 'single');
          }
          
          function showSuccess(message) {
            const el = document.getElementById('success-message');
            el.textContent = message;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 5000);
            location.reload();
          }
          
          function showError(message) {
            const el = document.getElementById('error-message');
            el.textContent = message;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 5000);
          }
          
          async function downloadDocument(docId, format) {
            try {
              const response = await fetch(\`/api/documents/\${docId}/download?format=\${format}\`);
              
              if (!response.ok) {
                showError('Download failed');
                return;
              }
              
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = \`document-\${docId}.\${format}\`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleFileUpload(event) {
            const files = event.target.files;
            const formData = new FormData();
            
            for (let file of files) {
              formData.append('files', file);
            }
            formData.append('customerId', '${customerId}');
            
            try {
              const response = await fetch('/api/content/upload', {
                method: 'POST',
                body: formData
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess(data.message || 'Files uploaded successfully!');
              } else {
                showError(data.error || 'Upload failed');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleWebsiteScrape() {
            const url = document.getElementById('websiteUrl').value;
            if (!url) {
              showError('Please enter a website URL');
              return;
            }
            
            try {
              const response = await fetch('/api/content/scrape-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: '${customerId}',
                  url,
                  mode: websiteMode
                })
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess(data.message || 'Website scraped successfully!');
              } else {
                showError(data.error || 'Scraping failed');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleYoutubeTranscript() {
            const url = document.getElementById('youtubeUrl').value;
            if (!url) {
              showError('Please enter a YouTube URL');
              return;
            }
            
            try {
              const response = await fetch('/api/content/youtube', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: '${customerId}',
                  url
                })
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess(data.message || 'Transcript extracted successfully!');
              } else {
                showError(data.error || 'Extraction failed');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleTextUpload() {
            const title = document.getElementById('textTitle').value;
            const content = document.getElementById('textContent').value;
            
            if (!title || !content) {
              showError('Please fill in both title and content');
              return;
            }
            
            try {
              const response = await fetch('/api/content/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: '${customerId}',
                  title,
                  content
                })
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess(data.message || 'Text uploaded successfully!');
                document.getElementById('textTitle').value = '';
                document.getElementById('textContent').value = '';
              } else {
                showError(data.error || 'Upload failed');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleQAUpload() {
            const question = document.getElementById('qaQuestion').value;
            const answer = document.getElementById('qaAnswer').value;
            
            if (!question || !answer) {
              showError('Please fill in both question and answer');
              return;
            }
            
            const content = \`Q: \${question}\\n\\nA: \${answer}\`;
            const title = \`Q&A: \${question.substring(0, 50)}\${question.length > 50 ? '...' : ''}\`;
            
            try {
              const response = await fetch('/api/content/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: '${customerId}',
                  title: title,
                  content: content
                })
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess('Q&A pair added successfully!');
                document.getElementById('qaQuestion').value = '';
                document.getElementById('qaAnswer').value = '';
              } else {
                showError(data.error || 'Failed to add Q&A pair');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
          }
          
          async function handleBotInstructionsUpdate() {
            const instructions = document.getElementById('botInstructions').value;
            
            if (!instructions) {
              showError('Please enter bot instructions');
              return;
            }
            
            try {
              const response = await fetch('/api/customer/instructions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: '${customerId}',
                  instructions: instructions
                })
              });
              const data = await response.json();
              
              if (response.ok) {
                showSuccess('Bot instructions updated successfully!');
              } else {
                showError(data.error || 'Failed to update instructions');
              }
            } catch (error) {
              showError('Network error. Please try again.');
            }
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
