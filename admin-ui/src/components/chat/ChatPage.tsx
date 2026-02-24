import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { api, type Guild } from '@/lib/api';

interface ChatMessage {
  text: string;
  isUser: boolean;
}

export function ChatPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildId, setGuildId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.fetchGuilds().then((data) => {
      setGuilds(data.guilds);
      if (data.guilds.length > 0) setGuildId(data.guilds[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || !guildId) return;

    setMessages((prev) => [...prev, { text: question, isUser: true }]);
    setInput('');
    setSending(true);

    try {
      const data = await api.sendChat(question, guildId);
      setMessages((prev) => [...prev, { text: data.answer || data.error || 'No response', isUser: false }]);
    } catch (err) {
      setMessages((prev) => [...prev, { text: `Error: ${err instanceof Error ? err.message : String(err)}`, isUser: false }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Chat</h1>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Guild</span>
        <Select value={guildId} onValueChange={setGuildId}>
          <SelectTrigger className="w-full max-w-[300px]">
            <SelectValue placeholder="Select guild..." />
          </SelectTrigger>
          <SelectContent>
            {guilds.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="mb-4 shadow-sm">
        <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
          <div ref={scrollRef} className="flex flex-col gap-2 p-4">
            {messages.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Ask NubbyGPT something...
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm break-words',
                  msg.isUser
                    ? 'self-end rounded-br-sm bg-foreground text-background'
                    : 'self-start rounded-bl-sm bg-muted text-foreground',
                )}
              >
                {msg.text}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask NubbyGPT something..."
          disabled={sending}
          autoComplete="off"
          className="min-h-11 text-base"
        />
        <Button type="submit" disabled={sending || !guildId} className="min-h-11 px-6">
          Send
        </Button>
      </form>
    </div>
  );
}
