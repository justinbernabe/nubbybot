import { layout } from './layout.js';

export function promptsPage(): string {
  return layout(
    'Prompts',
    `
    <h1>Prompts</h1>
    <p style="color:#999;font-size:0.85rem;margin-bottom:1.5rem">Edit system prompts. Changes take effect on the next bot query — no restart needed.</p>
    <div id="prompts-container"></div>
    <script>
      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function friendlyName(key) {
        return key.replace(/_/g, ' ').replace('SYSTEM PROMPT', '').trim();
      }

      async function loadPrompts() {
        const r = await fetch('/api/prompts');
        const d = await r.json();
        const container = document.getElementById('prompts-container');
        container.innerHTML = '';

        for (const [key, info] of Object.entries(d.prompts)) {
          const section = document.createElement('div');
          section.className = 'prompt-section';
          const badge = info.isOverridden
            ? '<span class="badge override">Modified</span>'
            : '<span class="badge default">Default</span>';
          section.innerHTML = '<h2>' + escHtml(friendlyName(key)) + ' ' + badge + '</h2>'
            + '<textarea id="prompt-' + escHtml(key) + '">' + escHtml(info.current) + '</textarea>'
            + '<div class="btn-row">'
            + '<button onclick="savePrompt(\\''+key+'\\')">Save</button>'
            + (info.isOverridden ? '<button class="danger" onclick="resetPrompt(\\''+key+'\\')">Reset to Default</button>' : '')
            + '</div>';
          container.appendChild(section);
        }
      }

      async function savePrompt(key) {
        const textarea = document.getElementById('prompt-' + key);
        try {
          const r = await fetch('/api/prompts/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: textarea.value }),
          });
          if (r.ok) {
            showToast('Prompt saved');
            loadPrompts();
          } else {
            const d = await r.json();
            showToast(d.error || 'Save failed', true);
          }
        } catch(e) { showToast('Save failed', true); }
      }

      async function resetPrompt(key) {
        if (!confirm('Reset this prompt to the hardcoded default?')) return;
        try {
          const r = await fetch('/api/prompts/' + encodeURIComponent(key), { method: 'DELETE' });
          if (r.ok) {
            showToast('Prompt reset to default');
            loadPrompts();
          } else {
            showToast('Reset failed', true);
          }
        } catch(e) { showToast('Reset failed', true); }
      }

      loadPrompts();
    </script>`,
    'prompts',
  );
}
