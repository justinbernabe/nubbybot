import { layout } from './layout.js';

export function dashboardPage(): string {
  return layout(
    'Dashboard',
    `
    <h1>Dashboard</h1>
    <div class="grid" id="stats">
      <div class="card stat"><div class="value" id="s-messages">-</div><div class="label">Messages</div></div>
      <div class="card stat"><div class="value" id="s-users">-</div><div class="label">Users</div></div>
      <div class="card stat"><div class="value" id="s-channels">-</div><div class="label">Channels</div></div>
      <div class="card stat"><div class="value" id="s-profiles">-</div><div class="label">Profiles</div></div>
      <div class="card stat"><div class="value" id="s-queries">-</div><div class="label">Queries</div></div>
      <div class="card stat"><div class="value" id="s-uptime">-</div><div class="label">Uptime</div></div>
    </div>
    <div class="card">
      <div class="settings-row"><span class="settings-key">Version</span><span class="settings-val" id="s-version">-</span></div>
      <div class="settings-row"><span class="settings-key">Messages Today</span><span class="settings-val" id="s-today">-</span></div>
      <div class="settings-row"><span class="settings-key">Queries Today</span><span class="settings-val" id="s-queries-today">-</span></div>
      <div class="settings-row"><span class="settings-key">Avg Response Time</span><span class="settings-val" id="s-avg-ms">-</span></div>
      <div class="settings-row"><span class="settings-key">Backfill Complete</span><span class="settings-val" id="s-backfill">-</span></div>
    </div>
    <script>
      function fmt(n) { return n != null ? n.toLocaleString() : '-'; }
      function fmtUptime(s) {
        if (s == null) return '-';
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        return (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm';
      }
      async function load() {
        try {
          const r = await fetch('/api/stats');
          const d = await r.json();
          document.getElementById('s-messages').textContent = fmt(d.messages?.total);
          document.getElementById('s-users').textContent = fmt(d.users?.total);
          document.getElementById('s-channels').textContent = fmt(d.channels?.total);
          document.getElementById('s-profiles').textContent = fmt(d.users?.withProfiles);
          document.getElementById('s-queries').textContent = fmt(d.queries?.total);
          document.getElementById('s-uptime').textContent = fmtUptime(d.uptime);
          document.getElementById('s-version').textContent = d.version || '-';
          document.getElementById('s-today').textContent = fmt(d.messages?.today);
          document.getElementById('s-queries-today').textContent = fmt(d.queries?.today);
          document.getElementById('s-avg-ms').textContent = d.queries?.avgResponseMs ? Math.round(d.queries.avgResponseMs) + 'ms' : '-';
          document.getElementById('s-backfill').textContent = (d.channels?.backfillComplete ?? '-') + ' / ' + (d.channels?.total ?? '-');
        } catch(e) { console.error(e); }
      }
      load();
      setInterval(load, 15000);
    </script>`,
    'dashboard',
  );
}
