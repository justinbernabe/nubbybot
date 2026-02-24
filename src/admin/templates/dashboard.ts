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
      <div class="section-label">Details</div>
      <div class="settings-row"><span class="settings-key">Version</span><span class="settings-val" id="s-version">-</span></div>
      <div class="settings-row"><span class="settings-key">Messages Today</span><span class="settings-val" id="s-today">-</span></div>
      <div class="settings-row"><span class="settings-key">Queries Today</span><span class="settings-val" id="s-queries-today">-</span></div>
      <div class="settings-row"><span class="settings-key">Avg Response Time</span><span class="settings-val" id="s-avg-ms">-</span></div>
      <div class="settings-row"><span class="settings-key">Backfill Complete</span><span class="settings-val" id="s-backfill">-</span></div>
      <div class="settings-row"><span class="settings-key">Links Analyzed</span><span class="settings-val" id="s-links">-</span></div>
    </div>
    <div class="card" style="display:flex;flex-wrap:wrap;align-items:center;gap:1rem">
      <div style="flex:1;min-width:200px">
        <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.2rem">Link Scraper</div>
        <div style="color:#999;font-size:0.8rem">Analyze URLs from the last year of messages</div>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center">
        <span id="scrape-status" style="color:#999;font-size:0.8rem"></span>
        <button id="scrape-btn" onclick="startScrape()" style="min-height:44px">Scrape Links</button>
      </div>
    </div>
    <div class="card" style="display:flex;flex-wrap:wrap;align-items:center;gap:1rem">
      <div style="flex:1;min-width:200px">
        <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.2rem">Profile Builder</div>
        <div style="color:#999;font-size:0.8rem">Build/refresh AI profiles for users with 10+ messages</div>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center">
        <span id="profile-status" style="color:#999;font-size:0.8rem"></span>
        <button id="profile-btn" onclick="startProfileBuild()" style="min-height:44px">Build Profiles</button>
      </div>
    </div>
    <div class="card" id="cost-card" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
        <div>
          <div class="section-label" style="margin-bottom:0.25rem">API Cost Analysis</div>
          <div style="color:#999;font-size:0.8rem">Token usage and estimated costs</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:0.7rem;color:#999;text-transform:uppercase;letter-spacing:0.05em">Follow-up Windows</div>
          <div id="cost-followup-windows" style="font-size:1.5rem;font-weight:800;color:#000">-</div>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:1rem">
        <div class="card stat" style="margin-bottom:0;background:#fafafa;box-shadow:none;border:1px solid #f0f0f0">
          <div class="value" id="cost-today-calls" style="font-size:1.4rem">-</div>
          <div class="label">API Calls Today</div>
        </div>
        <div class="card stat" style="margin-bottom:0;background:#fafafa;box-shadow:none;border:1px solid #f0f0f0">
          <div class="value" id="cost-today-tokens" style="font-size:1.4rem">-</div>
          <div class="label">Tokens Today</div>
        </div>
        <div class="card stat" style="margin-bottom:0;background:#fafafa;box-shadow:none;border:1px solid #f0f0f0">
          <div class="value" id="cost-today-est" style="font-size:1.4rem">-</div>
          <div class="label">Est. Cost Today</div>
        </div>
        <div class="card stat" style="margin-bottom:0;background:#fafafa;box-shadow:none;border:1px solid #f0f0f0">
          <div class="value" id="cost-alltime-est" style="font-size:1.4rem">-</div>
          <div class="label">Est. Total Cost</div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead>
            <tr style="border-bottom:2px solid #f0f0f0;text-align:left">
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Function</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Model</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:right">Calls</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:right">Input</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:right">Output</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Cost</th>
              <th style="padding:0.6rem 0.75rem;color:#999;font-weight:500;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;text-align:right">Est. $</th>
            </tr>
          </thead>
          <tbody id="cost-table-body">
            <tr><td colspan="7" style="padding:1.5rem;text-align:center;color:#999">Loading...</td></tr>
          </tbody>
        </table>
      </div>
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
          document.getElementById('s-links').textContent = (d.links?.analyzed ?? '-') + ' / ' + (d.links?.total ?? '-');
        } catch(e) { console.error(e); }
      }
      load();
      setInterval(load, 15000);

      async function checkScrapeStatus() {
        try {
          const r = await fetch('/api/link-scrape/status');
          const d = await r.json();
          const btn = document.getElementById('scrape-btn');
          const status = document.getElementById('scrape-status');
          if (d.running) {
            btn.disabled = true;
            btn.textContent = 'Running...';
            status.textContent = 'Scrape in progress';
            status.style.color = '#b45000';
          } else {
            btn.disabled = false;
            btn.textContent = 'Scrape Links';
            status.textContent = '';
          }
        } catch(e) { console.error(e); }
      }
      checkScrapeStatus();
      setInterval(checkScrapeStatus, 5000);

      async function startScrape() {
        const btn = document.getElementById('scrape-btn');
        try {
          const gr = await fetch('/api/guilds');
          const gd = await gr.json();
          if (!gd.guilds || gd.guilds.length === 0) {
            showToast('No guilds found', true);
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Starting...';
          const r = await fetch('/api/link-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gd.guilds[0].id }),
          });
          const d = await r.json();
          if (r.ok) {
            showToast(d.message || 'Scrape started');
          } else {
            showToast(d.error || 'Failed to start', true);
            btn.disabled = false;
            btn.textContent = 'Scrape Links';
          }
        } catch(e) {
          showToast('Failed to start scrape', true);
          btn.disabled = false;
          btn.textContent = 'Scrape Links';
        }
      }

      async function checkProfileStatus() {
        try {
          const r = await fetch('/api/profile-build/status');
          const d = await r.json();
          const btn = document.getElementById('profile-btn');
          const status = document.getElementById('profile-status');
          if (d.running) {
            btn.disabled = true;
            btn.textContent = 'Running...';
            status.textContent = 'Building profiles';
            status.style.color = '#b45000';
          } else {
            btn.disabled = false;
            btn.textContent = 'Build Profiles';
            status.textContent = '';
          }
        } catch(e) { console.error(e); }
      }
      checkProfileStatus();
      setInterval(checkProfileStatus, 5000);

      async function startProfileBuild() {
        const btn = document.getElementById('profile-btn');
        try {
          const gr = await fetch('/api/guilds');
          const gd = await gr.json();
          if (!gd.guilds || gd.guilds.length === 0) {
            showToast('No guilds found', true);
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Starting...';
          const r = await fetch('/api/profile-build', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gd.guilds[0].id }),
          });
          const d = await r.json();
          if (r.ok) {
            showToast(d.message || 'Profile build started');
          } else {
            showToast(d.error || 'Failed to start', true);
            btn.disabled = false;
            btn.textContent = 'Build Profiles';
          }
        } catch(e) {
          showToast('Failed to start profile build', true);
          btn.disabled = false;
          btn.textContent = 'Build Profiles';
        }
      }

      async function loadCosts() {
        try {
          const r = await fetch('/api/costs');
          const d = await r.json();
          const card = document.getElementById('cost-card');
          card.style.display = '';

          document.getElementById('cost-today-calls').textContent = fmt(d.today?.call_count);
          document.getElementById('cost-today-tokens').textContent =
            fmt((d.today?.total_input ?? 0) + (d.today?.total_output ?? 0));
          document.getElementById('cost-today-est').textContent =
            d.today?.estimatedCost != null ? '$' + d.today.estimatedCost.toFixed(4) : '-';
          document.getElementById('cost-alltime-est').textContent =
            d.allTime?.estimatedCost != null ? '$' + d.allTime.estimatedCost.toFixed(4) : '-';
          document.getElementById('cost-followup-windows').textContent =
            fmt(d.activeFollowUpWindows);

          const tbody = document.getElementById('cost-table-body');
          while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
          if (d.byType && d.byType.length > 0) {
            for (const row of d.byType) {
              const isHigh = row.costLevel === 'HIGH';
              const shortModel = row.model.includes('haiku') ? 'Haiku' : 'Sonnet';
              const tr = document.createElement('tr');
              tr.style.borderBottom = '1px solid #f0f0f0';
              const cellStyle = 'padding:0.5rem 0.75rem';
              const cells = [
                { text: row.label, style: cellStyle + ';font-weight:500' },
                { text: shortModel, style: cellStyle + ';color:#999' },
                { text: fmt(row.callCount), style: cellStyle + ';text-align:right' },
                { text: fmt(row.totalInput), style: cellStyle + ';text-align:right' },
                { text: fmt(row.totalOutput), style: cellStyle + ';text-align:right' },
              ];
              for (const c of cells) {
                const td = document.createElement('td');
                td.style.cssText = c.style;
                td.textContent = c.text;
                tr.appendChild(td);
              }
              const tdLevel = document.createElement('td');
              tdLevel.style.cssText = cellStyle;
              const badge = document.createElement('span');
              badge.style.cssText = isHigh
                ? 'background:#000;color:#fff;padding:0.15rem 0.5rem;border-radius:100px;font-size:0.7rem;font-weight:600'
                : 'background:#f0f0f0;color:#666;padding:0.15rem 0.5rem;border-radius:100px;font-size:0.7rem;font-weight:600';
              badge.textContent = row.costLevel;
              tdLevel.appendChild(badge);
              tr.appendChild(tdLevel);
              const tdCost = document.createElement('td');
              tdCost.style.cssText = cellStyle + ';text-align:right;font-weight:600';
              tdCost.textContent = '$' + row.estimatedCost.toFixed(4);
              tr.appendChild(tdCost);
              tbody.appendChild(tr);
            }
          } else {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.style.cssText = 'padding:1.5rem;text-align:center;color:#999';
            td.textContent = 'No API calls tracked yet';
            tr.appendChild(td);
            tbody.appendChild(tr);
          }
        } catch(e) { console.error('Failed to load costs:', e); }
      }
      loadCosts();
      setInterval(loadCosts, 15000);
    </script>`,
    'dashboard',
  );
}
