export function layout(title: string, content: string, activePage: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - NubbyBot Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f8f8f8; color: #000; min-height: 100vh; -webkit-font-smoothing: antialiased; }

    /* Nav */
    nav { background: #fff; padding: 0 2rem; display: flex; align-items: center; height: 56px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 50; }
    nav .brand { color: #000; font-weight: 800; font-size: 1rem; letter-spacing: -0.02em; margin-right: 2.5rem; }
    nav a { color: #999; text-decoration: none; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500; transition: all 0.15s; }
    nav a:hover { color: #000; background: #f5f5f5; }
    nav a.active { color: #000; font-weight: 600; }

    /* Layout */
    main { max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; color: #000; letter-spacing: -0.02em; }

    /* Cards */
    .card { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06); border: none; }

    /* Stats grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat { text-align: center; padding: 1.25rem 1rem; }
    .stat .value { font-size: 2rem; font-weight: 800; color: #000; letter-spacing: -0.03em; }
    .stat .label { font-size: 0.75rem; color: #999; margin-top: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }

    /* Form elements */
    textarea { width: 100%; min-height: 250px; background: #fff; color: #000; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.875rem; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px; resize: vertical; line-height: 1.6; transition: border-color 0.15s, box-shadow 0.15s; }
    textarea:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }
    input[type="text"], input[type="password"] { background: #fff; color: #000; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.55rem 0.875rem; font-size: 0.9rem; transition: border-color 0.15s, box-shadow 0.15s; }
    input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }
    select { background: #fff; color: #000; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.45rem 0.75rem; font-size: 0.85rem; transition: border-color 0.15s; cursor: pointer; }
    select:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

    /* Buttons */
    button { background: #000; color: #fff; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: all 0.15s; }
    button:hover { background: #222; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    button.secondary { background: #fff; color: #000; border: 1px solid #e0e0e0; }
    button.secondary:hover { background: #f5f5f5; border-color: #ccc; }
    button.danger { background: #fff; color: #d00; border: 1px solid #fcc; }
    button.danger:hover { background: #fff5f5; border-color: #d00; }
    .btn-row { display: flex; gap: 0.5rem; margin-top: 1rem; }

    /* Badges */
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 100px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.02em; }
    .badge.override { background: #000; color: #fff; }
    .badge.default { background: #f0f0f0; color: #666; }

    /* Logs */
    .log-container { background: #fff; border: 1px solid #e8e8e8; border-radius: 12px; padding: 0.75rem; max-height: 600px; overflow-y: auto; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .log-entry { padding: 0.3rem 0.5rem; border-bottom: 1px solid #f5f5f5; white-space: pre-wrap; word-break: break-all; }
    .log-entry:last-child { border-bottom: none; }
    .level-error { color: #c00; font-weight: 600; }
    .level-warn { color: #b45000; }
    .level-info { color: #555; }
    .level-debug { color: #bbb; }
    .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }

    /* Prompts */
    .prompt-section { margin-bottom: 2rem; }
    .prompt-section h2 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.6rem; }

    /* Settings */
    .settings-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #f0f0f0; }
    .settings-row:last-child { border-bottom: none; }
    .settings-key { font-family: 'SF Mono', monospace; color: #000; font-size: 0.85rem; font-weight: 600; }
    .settings-val { color: #666; font-size: 0.85rem; }

    /* Toast */
    .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #000; color: #fff; padding: 0.7rem 1.4rem; border-radius: 10px; font-size: 0.85rem; font-weight: 500; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .toast.error { background: #d00; }
    .toast.show { opacity: 1; }

    /* Helpers */
    .muted { color: #999; }
    .section-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 0.75rem; }

    @media (max-width: 640px) {
      nav { padding: 0 0.75rem; height: auto; min-height: 56px; flex-wrap: wrap; gap: 0; }
      nav .brand { width: 100%; padding: 0.6rem 0 0.3rem; margin-right: 0; }
      nav a { padding: 0.4rem 0.6rem; font-size: 0.8rem; }
      main { padding: 0 0.75rem; margin: 1.25rem auto; }
      h1 { font-size: 1.2rem; margin-bottom: 1rem; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
      .stat .value { font-size: 1.5rem; }
      .stat { padding: 1rem 0.75rem; }
      .card { padding: 1rem; border-radius: 10px; }
      .settings-row { flex-direction: column; align-items: flex-start; gap: 0.2rem; }
      .settings-val { word-break: break-all; }
      .filter-bar { flex-wrap: wrap; }
      .log-container { max-height: 450px; font-size: 11px; border-radius: 10px; }
      .log-entry { padding: 0.3rem 0.25rem; }
      textarea { min-height: 180px; font-size: 12px; }
      .btn-row { flex-wrap: wrap; }
      button { padding: 0.55rem 1rem; min-height: 44px; }
      .prompt-section h2 { flex-wrap: wrap; font-size: 0.85rem; }
      .toast { left: 0.75rem; right: 0.75rem; bottom: 0.75rem; text-align: center; }
    }
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
