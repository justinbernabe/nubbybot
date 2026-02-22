import Transport from 'winston-transport';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

export class MemoryTransport extends Transport {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(opts?: Transport.TransportStreamOptions & { maxSize?: number }) {
    super(opts);
    this.maxSize = opts?.maxSize ?? 500;
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));
    this.buffer.push({
      timestamp: (info.timestamp as string) ?? new Date().toISOString(),
      level: info.level as string,
      message: info.message as string,
      ...(info.error ? { error: String(info.error) } : {}),
    });
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    callback();
  }

  getEntries(opts?: { level?: string; since?: string }): LogEntry[] {
    let entries = this.buffer;
    if (opts?.level) {
      entries = entries.filter((e) => e.level === opts.level);
    }
    if (opts?.since) {
      entries = entries.filter((e) => e.timestamp > opts.since!);
    }
    return entries;
  }
}
