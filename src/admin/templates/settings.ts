import { layout } from './layout.js';

export function settingsPage(): string {
  return layout(
    'Settings',
    `
    <h1>Settings</h1>
    <p style="color:#999;font-size:0.85rem;margin-bottom:1.5rem">Current configuration (read-only, set via environment variables).</p>
    <div class="card" id="settings-container"></div>
    <script>
      function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      async function loadSettings() {
        try {
          const r = await fetch('/api/settings');
          const d = await r.json();
          const container = document.getElementById('settings-container');
          container.innerHTML = '';
          for (const [key, val] of Object.entries(d.settings)) {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.innerHTML = '<span class="settings-key">' + escHtml(key) + '</span>'
              + '<span class="settings-val">' + escHtml(val) + '</span>';
            container.appendChild(row);
          }
        } catch(e) { console.error(e); }
      }
      loadSettings();
    </script>`,
    'settings',
  );
}
