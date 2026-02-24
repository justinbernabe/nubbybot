import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api, type LogEntry } from '@/lib/api';
import { cn } from '@/lib/utils';

const LEVEL_COLORS: Record<string, string> = {
  error: 'text-red-700 font-semibold',
  warn: 'text-amber-700',
  info: 'text-neutral-500',
  debug: 'text-neutral-400',
};

function LogLine({ entry }: { entry: LogEntry }) {
  const ts = entry.timestamp?.substring(11, 23) ?? '';
  const lvl = entry.level || 'info';
  return (
    <div className="border-b border-border/50 px-2 py-1 font-mono text-xs last:border-b-0">
      <span className={cn(LEVEL_COLORS[lvl])}>
        [{lvl.toUpperCase().padEnd(5)}]
      </span>{' '}
      <span className="text-muted-foreground">{ts}</span>{' '}
      {entry.message}
      {entry.error && <span className="text-red-700"> {String(entry.error)}</span>}
    </div>
  );
}

export function LogsPage() {
  const [level, setLevel] = useState('');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const lastTimestamp = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (full: boolean) => {
    try {
      const since = full ? undefined : lastTimestamp.current || undefined;
      const data = await api.fetchLogs(level || undefined, since);
      if (full) {
        setEntries(data.logs);
      } else if (data.logs.length > 0) {
        setEntries((prev) => [...prev, ...data.logs]);
      }
      for (const e of data.logs) {
        if (e.timestamp > lastTimestamp.current) lastTimestamp.current = e.timestamp;
      }
    } catch (err) {
      console.error(err);
    }
  }, [level]);

  useEffect(() => {
    lastTimestamp.current = '';
    fetchLogs(true);
    const id = setInterval(() => fetchLogs(false), 3000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  function clearLogs() {
    setEntries([]);
    lastTimestamp.current = '';
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Logs</h1>
      <div className="mb-4 flex items-center gap-3">
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" size="sm" onClick={clearLogs}>
          Clear View
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} entries
        </span>
      </div>
      <ScrollArea className="h-[600px] rounded-xl border bg-card shadow-sm">
        <div ref={scrollRef} className="p-2">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No log entries</p>
          ) : (
            entries.map((entry, i) => <LogLine key={i} entry={entry} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
