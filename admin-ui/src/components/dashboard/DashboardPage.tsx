import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { usePolling } from '@/hooks/usePolling';
import { api, type StatsResponse, type CostsResponse, type Guild } from '@/lib/api';

function fmt(n: number | null | undefined) {
  return n != null ? n.toLocaleString() : '-';
}

function fmtUptime(s: number | null | undefined) {
  if (s == null) return '-';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm';
}

function StatCard({ value, label, loading }: { value: string; label: string; loading: boolean }) {
  return (
    <Card className="py-5 text-center shadow-sm">
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      ) : (
        <>
          <div className="text-2xl font-extrabold tracking-tight">{value}</div>
          <div className="mt-1 text-[0.7rem] font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
        </>
      )}
    </Card>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  runningLabel,
  running,
  onStart,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  runningLabel: string;
  running: boolean;
  onStart: () => void;
}) {
  return (
    <Card className="shadow-sm">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-[200px] flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <span className="text-xs font-medium text-amber-700">{runningLabel}</span>
          )}
          <Button onClick={onStart} disabled={running} className="min-h-11">
            {running ? 'Running...' : buttonLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { data: stats, loading: statsLoading } = usePolling<StatsResponse>(() => api.fetchStats(), 15000);
  const { data: costs } = usePolling<CostsResponse>(() => api.fetchCosts(), 15000);
  const { data: scrapeStatus } = usePolling(() => api.getLinkScrapeStatus(), 5000);
  const { data: profileStatus } = usePolling(() => api.getProfileBuildStatus(), 5000);
  const [guilds, setGuilds] = useState<Guild[] | null>(null);

  async function getGuilds(): Promise<Guild[]> {
    if (guilds) return guilds;
    const data = await api.fetchGuilds();
    setGuilds(data.guilds);
    return data.guilds;
  }

  async function startScrape() {
    try {
      const g = await getGuilds();
      if (g.length === 0) { toast.error('No guilds found'); return; }
      const data = await api.startLinkScrape(g[0].id);
      toast.success(data.message || 'Scrape started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start');
    }
  }

  async function startProfileBuild() {
    try {
      const g = await getGuilds();
      if (g.length === 0) { toast.error('No guilds found'); return; }
      const data = await api.startProfileBuild(g[0].id);
      toast.success(data.message || 'Profile build started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start');
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Stats Grid */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard value={fmt(stats?.messages?.total)} label="Messages" loading={statsLoading} />
        <StatCard value={fmt(stats?.users?.total)} label="Users" loading={statsLoading} />
        <StatCard value={fmt(stats?.channels?.total)} label="Channels" loading={statsLoading} />
        <StatCard value={fmt(stats?.users?.withProfiles)} label="Profiles" loading={statsLoading} />
        <StatCard value={fmt(stats?.queries?.total)} label="Queries" loading={statsLoading} />
        <StatCard value={fmtUptime(stats?.uptime)} label="Uptime" loading={statsLoading} />
      </div>

      {/* Details Card */}
      <Card className="mb-4 shadow-sm">
        <div className="p-5">
          <div className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
            Details
          </div>
          <div className="divide-y divide-border">
            {[
              ['Version', stats?.version ?? '-'],
              ['Messages Today', fmt(stats?.messages?.today)],
              ['Queries Today', fmt(stats?.queries?.today)],
              ['Avg Response Time', stats?.queries?.avgResponseMs ? Math.round(stats.queries.avgResponseMs) + 'ms' : '-'],
              ['Backfill Complete', `${stats?.channels?.backfillComplete ?? '-'} / ${stats?.channels?.total ?? '-'}`],
              ['Links Analyzed', `${stats?.links?.analyzed ?? '-'} / ${stats?.links?.total ?? '-'}`],
            ].map(([key, val]) => (
              <div key={key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="font-mono text-sm font-semibold">{key}</span>
                <span className="text-sm text-muted-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Action Cards */}
      <div className="mb-4 space-y-3">
        <ActionCard
          title="Link Scraper"
          description="Analyze URLs from the last year of messages"
          buttonLabel="Scrape Links"
          runningLabel="Scrape in progress"
          running={scrapeStatus?.running ?? false}
          onStart={startScrape}
        />
        <ActionCard
          title="Profile Builder"
          description="Build/refresh AI profiles for users with 10+ messages"
          buttonLabel="Build Profiles"
          runningLabel="Building profiles"
          running={profileStatus?.running ?? false}
          onStart={startProfileBuild}
        />
      </div>

      {/* Cost Analysis */}
      {costs && (
        <Card className="shadow-sm">
          <div className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="mb-0.5 text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  API Cost Analysis
                </div>
                <div className="text-xs text-muted-foreground">Token usage and estimated costs</div>
              </div>
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Follow-up Windows</div>
                <div className="text-xl font-extrabold">{fmt(costs.activeFollowUpWindows)}</div>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [fmt(costs.today?.call_count), 'API Calls Today'],
                [fmt((costs.today?.total_input ?? 0) + (costs.today?.total_output ?? 0)), 'Tokens Today'],
                [costs.today?.estimatedCost != null ? `$${costs.today.estimatedCost.toFixed(4)}` : '-', 'Est. Cost Today'],
                [costs.allTime?.estimatedCost != null ? `$${costs.allTime.estimatedCost.toFixed(4)}` : '-', 'Est. Total Cost'],
              ].map(([val, label]) => (
                <div key={label} className="rounded-lg border bg-muted/30 py-3 text-center">
                  <div className="text-lg font-bold">{val}</div>
                  <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* Cost Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[0.7rem] uppercase tracking-widest">Function</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-widest">Model</TableHead>
                  <TableHead className="text-right text-[0.7rem] uppercase tracking-widest">Calls</TableHead>
                  <TableHead className="text-right text-[0.7rem] uppercase tracking-widest">Input</TableHead>
                  <TableHead className="text-right text-[0.7rem] uppercase tracking-widest">Output</TableHead>
                  <TableHead className="text-[0.7rem] uppercase tracking-widest">Cost</TableHead>
                  <TableHead className="text-right text-[0.7rem] uppercase tracking-widest">Est. $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.byType.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      No API calls tracked yet
                    </TableCell>
                  </TableRow>
                ) : (
                  costs.byType.map((row) => (
                    <TableRow key={row.callType}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.model.includes('haiku') ? 'Haiku' : 'Sonnet'}
                      </TableCell>
                      <TableCell className="text-right">{fmt(row.callCount)}</TableCell>
                      <TableCell className="text-right">{fmt(row.totalInput)}</TableCell>
                      <TableCell className="text-right">{fmt(row.totalOutput)}</TableCell>
                      <TableCell>
                        <Badge variant={row.costLevel === 'HIGH' ? 'default' : 'secondary'}>
                          {row.costLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${row.estimatedCost.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
