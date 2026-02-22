export function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - NubbyBot Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-box { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 2rem; width: 320px; max-width: calc(100vw - 2rem); }
    .login-box h1 { font-size: 1.2rem; margin-bottom: 0.5rem; color: #7c8aff; }
    .login-box p { font-size: 0.85rem; color: #808099; margin-bottom: 1.25rem; }
    input { width: 100%; background: #12121f; color: #e0e0e0; border: 1px solid #2a2a4a; border-radius: 6px; padding: 0.6rem 0.75rem; font-size: 16px; margin-bottom: 1rem; min-height: 44px; }
    input:focus { outline: none; border-color: #7c8aff; }
    button { width: 100%; background: #7c8aff; color: #0f0f1a; border: none; padding: 0.6rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; min-height: 44px; }
    button:hover { background: #9aa4ff; }
    .error { color: #e05555; font-size: 0.85rem; margin-bottom: 0.75rem; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>NubbyBot Admin</h1>
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
