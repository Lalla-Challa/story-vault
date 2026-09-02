import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PROVIDER_DEFAULTS: Record<string, { label: string; placeholder: string; baseUrlPlaceholder: string }> = {
  openai: { label: "OpenAI", placeholder: "sk-…", baseUrlPlaceholder: "https://api.openai.com/v1 (optional)" },
  anthropic: { label: "Anthropic", placeholder: "sk-ant-…", baseUrlPlaceholder: "https://api.anthropic.com (optional)" },
  "openai-compatible": {
    label: "OpenAI-compatible (Ollama, LM Studio, aggregators…)",
    placeholder: "Optional",
    baseUrlPlaceholder: "https://provider.example.com/v1 — or paste the full …/chat/completions URL",
  },
};

export function AgentSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settingsQuery = trpc.agent.settings.get.useQuery(undefined, { enabled: open });
  const updateMutation = trpc.agent.settings.update.useMutation();
  const testMutation = trpc.agent.settings.test.useMutation();

  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setProvider(settingsQuery.data.provider);
      setBaseUrl(settingsQuery.data.baseUrl ?? "");
      setModel(settingsQuery.data.model ?? "");
      setContextWindow(settingsQuery.data.contextWindow ? String(settingsQuery.data.contextWindow) : "");
      setHasApiKey(settingsQuery.data.hasApiKey);
      setApiKey("");
    }
  }, [settingsQuery.data, open]);

  const defaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        provider: provider as "openai" | "anthropic" | "openai-compatible",
        baseUrl,
        model,
        apiKey: apiKey || undefined,
        contextWindow: contextWindow ? parseInt(contextWindow, 10) || null : null,
      });
      setHasApiKey(apiKey ? true : hasApiKey);
      setApiKey("");
      toast.success("AI settings saved");
      await settingsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    await handleSave();
    const res = await testMutation.mutateAsync();
    setTestResult(res);
    if (res.ok) toast.success("Connection OK");
    else toast.error("Connection failed — see details below");
  };

  const busy = updateMutation.isPending || testMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-paper-base">
        <DialogHeader>
          <DialogTitle className="font-headline-md text-headline-md text-ink-charcoal">
            Agent AI Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <label className="font-body-ui text-body-ui text-sage-slate block">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai-compatible">OpenAI-compatible (Ollama, LM Studio…)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-body-ui text-body-ui text-sage-slate block">
              Base URL <span className="font-caption">(optional)</span>
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={defaults.baseUrlPlaceholder}
              className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-body-ui text-body-ui text-sage-slate block">Model name</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022, llama3"
              className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-body-ui text-body-ui text-sage-slate block">
              Context window (tokens){" "}
              <span className="font-caption text-caption">— optional, auto-detected</span>
            </label>
            <input
              type="number"
              min={4096}
              max={2000000000}
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
              placeholder="e.g. 128000, 200000, 1000000"
              className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
            <p className="font-caption text-caption text-sage-slate">
              Leave blank to auto-detect from the model name. Set this when your provider
              advertises a window that the model name doesn't reveal (e.g. aggregators).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-body-ui text-body-ui text-sage-slate block">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                hasApiKey ? "•••••••••• (key saved — leave blank to keep it)" : defaults.placeholder
              }
              className="w-full bg-surface-container-low border border-muted-border rounded px-3 py-2 font-body-ui text-body-ui text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber"
            />
            <p className="font-caption text-caption text-sage-slate">
              Stored encrypted in your local vault (PIN-protected). Never sent anywhere except your
              configured provider.
            </p>
          </div>

          {testResult && (
            <div
              className={
                testResult.ok
                  ? "border border-emerald-200 bg-emerald-50 rounded-lg p-3 space-y-1"
                  : "border border-error/40 bg-error-container/40 rounded-lg p-3 space-y-1"
              }
            >
              <p className="font-body-ui text-body-ui text-ink-charcoal font-medium">
                {testResult.ok ? "✓ Connection OK" : "✗ Connection failed"}
              </p>
              {testResult.url && (
                <p className="font-caption text-caption break-all">
                  <span className="text-sage-slate">Calling:</span>{" "}
                  <code className="bg-paper-base px-1 rounded">{testResult.url}</code>
                </p>
              )}
              {!testResult.ok && (
                <p className="font-caption text-caption text-on-error-container break-all whitespace-pre-wrap">
                  {testResult.message}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={busy}
              className="px-4 py-2 rounded border border-muted-border text-sage-slate hover:text-ink-charcoal hover:border-ink-charcoal transition-colors font-body-ui text-body-ui disabled:opacity-50"
            >
              {testMutation.isPending ? "Testing…" : "Test connection"}
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-5 py-2 rounded bg-ink-charcoal text-paper-base hover:bg-primary-container transition-colors font-body-ui text-body-ui disabled:opacity-50"
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}