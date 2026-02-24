export function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - NubbyBot Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f8f8f8; color: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .login-box { background: #fff; border-radius: 16px; padding: 2.5rem; width: 340px; max-width: calc(100vw - 2rem); box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 0px 1px rgba(0,0,0,0.1); }
    .login-box h1 { font-size: 1.3rem; margin-bottom: 0.35rem; color: #000; font-weight: 800; letter-spacing: -0.02em; }
    .login-box p { font-size: 0.85rem; color: #999; margin-bottom: 1.5rem; }
    input { width: 100%; background: #fff; color: #000; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.65rem 0.875rem; font-size: 16px; margin-bottom: 1rem; min-height: 44px; transition: border-color 0.15s, box-shadow 0.15s; }
    input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }
    button { width: 100%; background: #000; color: #fff; border: none; padding: 0.65rem; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.9rem; min-height: 44px; transition: background 0.15s; }
    button:hover { background: #222; }
    .error { color: #d00; font-size: 0.85rem; margin-bottom: 0.75rem; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>NubbyBot</h1>
    <p>Enter admin token to continue.</p>
    <div id="error" class="error"></div>
    <form id="form">
      <input type="password" id="token" placeholder="Admin token" autocomplete="off" autofocus>
      <button type="submit">Login</button>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const errEl = document.getElementById('error');
      try {
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (r.ok) {
          window.location.href = '/';
        } else {
          errEl.textContent = 'Invalid token.';
          errEl.style.display = 'block';
        }
      } catch {
        errEl.textContent = 'Connection failed.';
        errEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}
