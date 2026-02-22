import { layout } from './layout.js';

export function chatPage(): string {
  return layout(
    'Chat',
    `
    <h1>Chat</h1>
    <div style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">
      <label style="color:#808099;font-size:0.85rem">Guild:</label>
      <select id="guild-select" style="background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a4a;border-radius:6px;padding:0.4rem 0.6rem;font-size:16px;min-height:44px;flex:1;max-width:300px"></select>
    </div>
    <div id="chat-messages" style="background:#12121f;border:1px solid #2a2a4a;border-radius:6px;padding:0.75rem;min-height:300px;max-height:calc(100vh - 250px);overflow-y:auto;margin-bottom:0.75rem;display:flex;flex-direction:column;gap:0.5rem"></div>
    <form id="chat-form" style="display:flex;gap:0.5rem">
      <input type="text" id="chat-input" placeholder="Ask NubbyGPT something..." autocomplete="off" style="flex:1;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a4a;border-radius:6px;padding:0.6rem 0.75rem;font-size:16px">
      <button type="submit" style="min-height:44px">Send</button>
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
          ? 'align-self:flex-end;background:#2a2a5a;color:#e0e0e0;padding:0.5rem 0.75rem;border-radius:8px 8px 2px 8px;max-width:85%;font-size:0.9rem;word-break:break-word'
          : 'align-self:flex-start;background:#1a2a1a;color:#c0d0c0;padding:0.5rem 0.75rem;border-radius:8px 8px 8px 2px;max-width:85%;font-size:0.9rem;word-break:break-word';
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      async function loadGuilds() {
        try {
          const r = await fetch('/api/stats');
          const d = await r.json();
          // For now, get guilds from a dedicated endpoint or use stats
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
