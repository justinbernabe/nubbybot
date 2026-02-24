import { layout } from './layout.js';

export function logsPage(): string {
  return layout(
    'Logs',
    `
    <h1>Logs</h1>
    <div class="filter-bar">
      <select id="level-filter">
        <option value="">All levels</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
      <button class="secondary" onclick="clearLogs()">Clear View</button>
      <span id="log-count" style="color:#999;font-size:0.8rem;margin-left:auto"></span>
    </div>
    <div class="log-container" id="log-container"></div>
    <script>
      let lastTimestamp = '';
      const container = document.getElementById('log-container');
      const countEl = document.getElementById('log-count');
      const levelFilter = document.getElementById('level-filter');

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      function renderEntry(e) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        const ts = e.timestamp ? e.timestamp.substring(11, 23) : '';
        const lvl = e.level || 'info';
        div.innerHTML = '<span class="level-' + lvl + '">[' + lvl.toUpperCase().padEnd(5) + ']</span> '
          + '<span style="color:#bbb">' + escHtml(ts) + '</span> '
          + escHtml(e.message || '')
          + (e.error ? ' <span class="level-error">' + escHtml(String(e.error)) + '</span>' : '');
        return div;
      }

      async function fetchLogs(full) {
        const level = levelFilter.value;
        let url = '/api/logs?';
        if (level) url += 'level=' + level + '&';
        if (!full && lastTimestamp) url += 'since=' + encodeURIComponent(lastTimestamp);
        try {
          const r = await fetch(url);
          const d = await r.json();
          if (full) container.innerHTML = '';
          if (d.logs && d.logs.length > 0) {
            for (const e of d.logs) {
              container.appendChild(renderEntry(e));
              if (e.timestamp > lastTimestamp) lastTimestamp = e.timestamp;
            }
            container.scrollTop = container.scrollHeight;
          }
          countEl.textContent = container.children.length + ' entries';
        } catch(e) { console.error(e); }
      }

      function clearLogs() {
        container.innerHTML = '';
        lastTimestamp = '';
        countEl.textContent = '0 entries';
      }

      levelFilter.addEventListener('change', () => { lastTimestamp = ''; fetchLogs(true); });
      fetchLogs(true);
      setInterval(() => fetchLogs(false), 3000);
    </script>`,
    'logs',
  );
}
