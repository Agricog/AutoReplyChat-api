import express from 'express';
const router = express.Router();

// GET /login - Login page
router.get('/', (req, res) => {
  // Redirect if already logged in
  if (req.session && req.session.customerId) {
    return res.redirect(`/api/dashboard/${req.session.customerId}`);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Auto Reply Chat</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          width: 100%;
          max-width: 400px;
        }
        h1 { 
          color: #1f2937;
          margin-bottom: 8px;
          font-size: 28px;
        }
        .subtitle {
          color: #6b7280;
          margin-bottom: 30px;
          font-size: 14px;
        }
        label {
          display: block;
          color: #374151;
          font-weight: 500;
          margin-bottom: 6px;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 16px;
          margin-bottom: 16px;
          transition: border-color 0.2s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button {
          width: 100%;
          background: #667eea;
          color: white;
          padding: 14px;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover { background: #5568d3; }
        button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .error {
          background: #fee2e2;
          color: #991b1b;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
          display: none;
        }
        .error.show { display: block; }
        .signup-link {
          text-align: center;
          margin-top: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .signup-link a {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
        }
        .signup-link a:hover { text-decoration: underline; }
        .loading { display: none; }
        .loading.show { display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome Back</h1>
        <p class="subtitle">Sign in to access your dashboard</p>
        
        <div id="error" class="error"></div>
        
        <form id="loginForm">
          <div>
            <label for="email">Email Address</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          
          <div>
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              required 
              autocomplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          
          <button type="submit" id="submitBtn">
            <span class="btn-text">Sign In</span>
            <span class="loading">Signing in...</span>
          </button>
        </form>
        
        <div class="signup-link">
          Don't have an account? <a href="/signup">Sign up</a>
        </div>
      </div>
      
      <script>
        const form = document.getElementById('loginForm');
        const errorDiv = document.getElementById('error');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loading = submitBtn.querySelector('.loading');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          errorDiv.classList.remove('show');
          submitBtn.disabled = true;
          btnText.style.display = 'none';
          loading.classList.add('show');
          
          const formData = {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
          };
          
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
              // Success - redirect to dashboard
              window.location.href = '/api/dashboard/' + data.customerId;
            } else {
              // Show error
              errorDiv.textContent = data.error || 'Login failed';
              errorDiv.classList.add('show');
              submitBtn.disabled = false;
              btnText.style.display = 'inline';
              loading.classList.remove('show');
            }
          } catch (error) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.classList.add('show');
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            loading.classList.remove('show');
          }
        });
      </script>
    </body>
    </html>
  `);
});

export default router;
