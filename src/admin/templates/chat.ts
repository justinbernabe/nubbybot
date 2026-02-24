import { layout } from './layout.js';

export function chatPage(): string {
  return layout(
    'Chat',
    `
    <h1>Chat</h1>
    <div style="margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem">
      <label style="color:#999;font-size:0.85rem;font-weight:500">Guild</label>
      <select id="guild-select" style="flex:1;max-width:300px;padding:0.5rem 0.75rem;font-size:16px;min-height:44px"></select>
    </div>
    <div id="chat-messages" style="background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:1rem;min-height:300px;max-height:calc(100vh - 280px);overflow-y:auto;margin-bottom:1rem;display:flex;flex-direction:column;gap:0.5rem;box-shadow:0 1px 3px rgba(0,0,0,0.04)"></div>
    <form id="chat-form" style="display:flex;gap:0.5rem">
      <input type="text" id="chat-input" placeholder="Ask NubbyGPT something..." autocomplete="off" style="flex:1;padding:0.65rem 0.875rem;font-size:16px;min-height:44px">
      <button type="submit" style="min-height:44px;padding:0.5rem 1.5rem">Send</button>
    </form>
    <script>
      const messagesEl = document.getElementById('chat-messages');
      const form = document.getElementById('chat-form');
      const input = document.getElementById('chat-input');
      const guildSelect = document.getElementById('guild-select');

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      function addMessage(text, isUser) {
        const div = document.createElement('div');
        div.style.cssText = isUser
          ? 'align-self:flex-end;background:#000;color:#fff;padding:0.6rem 0.875rem;border-radius:12px 12px 4px 12px;max-width:85%;font-size:0.9rem;word-break:break-word'
          : 'align-self:flex-start;background:#f5f5f5;color:#000;padding:0.6rem 0.875rem;border-radius:12px 12px 12px 4px;max-width:85%;font-size:0.9rem;word-break:break-word';
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      async function loadGuilds() {
        try {
          const r = await fetch('/api/stats');
          const d = await r.json();
          const gr = await fetch('/api/guilds');
          const gd = await gr.json();
          for (const g of gd.guilds) {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            guildSelect.appendChild(opt);
          }
        } catch(e) { console.error(e); }
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;
        const guildId = guildSelect.value;
        if (!guildId) { showToast('Select a guild first', true); return; }

        addMessage(question, true);
        input.value = '';
        input.disabled = true;

        try {
          const r = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, guildId }),
          });
          const d = await r.json();
          addMessage(d.answer || d.error || 'No response', false);
        } catch(err) {
          addMessage('Error: ' + err.message, false);
        }
        input.disabled = false;
        input.focus();
      });

      loadGuilds();
      input.focus();
    </script>`,
    'chat',
  );
}
