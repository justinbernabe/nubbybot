import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { api, type PromptInfo } from '@/lib/api';

function friendlyName(key: string) {
  return key.replace(/_/g, ' ').replace('SYSTEM PROMPT', '').trim();
}

function PromptSection({
  name,
  info,
  onSave,
  onReset,
}: {
  name: string;
  info: PromptInfo;
  onSave: (key: string, value: string) => Promise<void>;
  onReset: (key: string) => Promise<void>;
}) {
  const [value, setValue] = useState(info.current);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(name, value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 shadow-sm">
      <div className="p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <h2 className="text-sm font-semibold">{friendlyName(name)}</h2>
          {info.isOverridden ? (
            <Badge className="bg-foreground text-background hover:bg-foreground/90">Modified</Badge>
          ) : (
            <Badge variant="secondary">Default</Badge>
          )}
        </div>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-[200px] font-mono text-[13px] leading-relaxed"
        />
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {info.isOverridden && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/5">
                  Reset to Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset prompt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revert to the hardcoded default. Your custom changes will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onReset(name)}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </Card>
  );
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<Record<string, PromptInfo> | null>(null);

  async function loadPrompts() {
    try {
      const data = await api.fetchPrompts();
      setPrompts(data.prompts);
    } catch (err) {
      toast.error('Failed to load prompts');
      console.error(err);
    }
  }

  useEffect(() => {
    loadPrompts();
  }, []);

  async function handleSave(key: string, value: string) {
    try {
      await api.updatePrompt(key, value);
      toast.success('Prompt saved');
      loadPrompts();
    } catch {
      toast.error('Save failed');
    }
  }

  async function handleReset(key: string) {
    try {
      await api.resetPrompt(key);
      toast.success('Prompt reset to default');
      loadPrompts();
    } catch {
      toast.error('Reset failed');
    }
  }

  return (
    <div>
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Prompts</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edit system prompts. Changes take effect on the next bot query — no restart needed.
      </p>
      {prompts === null ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <div className="space-y-3 p-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-[200px] w-full" />
                <Skeleton className="h-9 w-20" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        Object.entries(prompts).map(([key, info]) => (
          <PromptSection key={key} name={key} info={info} onSave={handleSave} onReset={handleReset} />
        ))
      )}
    </div>
  );
}
