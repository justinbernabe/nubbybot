export function layout(title: string, content: string, activePage: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - NubbyBot Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }
    nav { background: #1a1a2e; padding: 0.75rem 2rem; display: flex; gap: 1.5rem; align-items: center; border-bottom: 1px solid #2a2a4a; }
    nav .brand { color: #7c8aff; font-weight: 700; font-size: 1.1rem; margin-right: 1rem; }
    nav a { color: #808099; text-decoration: none; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.9rem; transition: all 0.15s; }
    nav a:hover { color: #c0c0d0; background: #252540; }
    nav a.active { color: #7c8aff; background: #1e1e3a; }
    main { max-width: 1100px; margin: 1.5rem auto; padding: 0 1.5rem; }
    h1 { font-size: 1.3rem; margin-bottom: 1rem; color: #f0f0f0; }
    .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat { text-align: center; padding: 1rem; }
    .stat .value { font-size: 1.8rem; font-weight: 700; color: #7c8aff; }
    .stat .label { font-size: 0.8rem; color: #808099; margin-top: 0.25rem; }
    textarea { width: 100%; min-height: 250px; background: #12121f; color: #e0e0e0; border: 1px solid #2a2a4a; border-radius: 6px; padding: 0.75rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; resize: vertical; line-height: 1.5; }
    textarea:focus { outline: none; border-color: #7c8aff; }
    input[type="text"], input[type="password"] { background: #12121f; color: #e0e0e0; border: 1px solid #2a2a4a; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.9rem; }
    input:focus { outline: none; border-color: #7c8aff; }
    button { background: #7c8aff; color: #0f0f1a; border: none; padding: 0.45rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: background 0.15s; }
    button:hover { background: #9aa4ff; }
    button.secondary { background: #2a2a4a; color: #c0c0d0; }
    button.secondary:hover { background: #3a3a5a; }
    button.danger { background: #e05555; color: #fff; }
    button.danger:hover { background: #ff6b6b; }
    .btn-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge.override { background: #3a2a1a; color: #ffb347; }
    .badge.default { background: #1a2a1a; color: #6bcc6b; }
    .log-container { background: #12121f; border: 1px solid #2a2a4a; border-radius: 6px; padding: 0.5rem; max-height: 600px; overflow-y: auto; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
    .log-entry { padding: 0.2rem 0.5rem; border-bottom: 1px solid #1a1a2e; white-space: pre-wrap; word-break: break-all; }
    .log-entry:last-child { border-bottom: none; }
    .level-error { color: #e05555; }
    .level-warn { color: #ffb347; }
    .level-info { color: #6bcc6b; }
    .level-debug { color: #808099; }
    .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; align-items: center; }
    .filter-bar select { background: #1a1a2e; color: #e0e0e0; border: 1px solid #2a2a4a; border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
    .prompt-section { margin-bottom: 1.5rem; }
    .prompt-section h2 { font-size: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .settings-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #1e1e30; }
    .settings-row:last-child { border-bottom: none; }
    .settings-key { font-family: monospace; color: #7c8aff; font-size: 0.85rem; }
    .settings-val { color: #c0c0d0; font-size: 0.85rem; }
    .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #1a2a1a; color: #6bcc6b; border: 1px solid #2a4a2a; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.error { background: #2a1a1a; color: #e05555; border-color: #4a2a2a; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">NubbyBot</span>
    <a href="/" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
    <a href="/logs" class="${activePage === 'logs' ? 'active' : ''}">Logs</a>
    <a href="/prompts" class="${activePage === 'prompts' ? 'active' : ''}">Prompts</a>
    <a href="/settings" class="${activePage === 'settings' ? 'active' : ''}">Settings</a>
    <a href="/chat" class="${activePage === 'chat' ? 'active' : ''}">Chat</a>
  </nav>
  <main>${content}</main>
  <div id="toast" class="toast"></div>
  <script>
    function showToast(msg, isError) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show' + (isError ? ' error' : '');
      setTimeout(() => t.className = 'toast', 2500);
    }
  </script>
</body>
</html>`;
}
