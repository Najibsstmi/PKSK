import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Clock3, MailCheck, Play, RefreshCw, Search, Send, ShieldCheck, XCircle, Zap, type LucideIcon } from "lucide-react";
import {
  fetchZohoDashboard,
  previewZohoBackfill,
  processZohoQueue,
  retryFailedZohoSync,
  runZohoBackfill,
  syncSingleZohoUser,
  testZohoConnection,
} from "../../services/zohoAdminService";
import type { ZohoBackfillPreview, ZohoConnectionResult, ZohoDashboard, ZohoProcessResult } from "../../types/zoho";

type ZohoSyncPanelProps = {
  onMessage: (message: string | null) => void;
};

type BusyAction = "dashboard" | "test" | "preview" | "backfill" | "process" | "retry" | "single" | null;
type ConnectionStatus = "unknown" | "connected" | "failed";

export function ZohoSyncPanel({ onMessage }: ZohoSyncPanelProps) {
  const [dashboard, setDashboard] = useState<ZohoDashboard | null>(null);
  const [connection, setConnection] = useState<ZohoConnectionResult | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("unknown");
  const [preview, setPreview] = useState<ZohoBackfillPreview | null>(null);
  const [lastProcess, setLastProcess] = useState<ZohoProcessResult | null>(null);
  const [batchSize, setBatchSize] = useState(25);
  const [singleEmail, setSingleEmail] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>("dashboard");

  const loadDashboard = useCallback(async () => {
    setBusyAction((current) => current ?? "dashboard");
    try {
      const nextDashboard = await fetchZohoDashboard();
      setDashboard(nextDashboard);
    } catch (error) {
      onMessage(toMessage(error));
    } finally {
      setBusyAction((current) => (current === "dashboard" ? null : current));
    }
  }, [onMessage]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const currentPreview = preview ?? dashboard?.preview ?? null;
  const fieldMappings = dashboard?.field_mappings ?? [];
  const statusLabel = useMemo(() => {
    if (connectionStatus === "connected") {
      return "Connected";
    }
    if (connectionStatus === "failed") {
      return "Failed";
    }
    return "Belum test";
  }, [connectionStatus]);

  async function runAction(action: BusyAction, callback: () => Promise<string>) {
    setBusyAction(action);
    onMessage(null);
    try {
      const message = await callback();
      await loadDashboard();
      onMessage(message);
    } catch (error) {
      if (action === "test") {
        setConnectionStatus("failed");
      }
      onMessage(toMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function handleTestConnection() {
    void runAction("test", async () => {
      const result = await testZohoConnection();
      setConnection(result);
      setConnectionStatus("connected");
      return "Zoho connection berjaya disahkan.";
    });
  }

  function handlePreviewBackfill() {
    void runAction("preview", async () => {
      const result = await previewZohoBackfill();
      setPreview(result);
      return `Preview backfill siap: ${result.eligible_users} contact eligible untuk marketing.`;
    });
  }

  function handleRunBackfill() {
    if (!currentPreview) {
      onMessage("Tekan Preview Backfill dahulu sebelum run backfill sebenar.");
      return;
    }

    const confirmed = window.confirm(`Run backfill dan proses maksimum ${batchSize} contact sekarang? Operasi ini akan menulis ke Zoho untuk contact yang ada consent marketing sahaja.`);
    if (!confirmed) {
      return;
    }

    void runAction("backfill", async () => {
      const result = await runZohoBackfill(batchSize);
      setLastProcess(result.processed ?? null);
      return `Backfill batch selesai. Enqueued ${result.backfill?.enqueued ?? 0}; synced ${result.processed?.synced ?? 0}; skipped ${result.processed?.skipped ?? 0}; failed ${result.processed?.failed ?? 0}.`;
    });
  }

  function handleProcessQueue() {
    void runAction("process", async () => {
      const result = await processZohoQueue(batchSize);
      setLastProcess(result);
      return `Queue diproses: ${processSummary(result)}.`;
    });
  }

  function handleRetryFailed() {
    void runAction("retry", async () => {
      const result = await retryFailedZohoSync(batchSize);
      setLastProcess(result.processed ?? null);
      return `Retry failed selesai. Reset ${result.retry?.count ?? 0}; ${processSummary(result.processed)}.`;
    });
  }

  function handleSingleSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = singleEmail.trim().toLowerCase();
    if (!email) {
      onMessage("Masukkan e-mel pengguna untuk sync single user.");
      return;
    }

    void runAction("single", async () => {
      const result = await syncSingleZohoUser(email);
      setLastProcess(result.processed ?? null);
      return `Single user sync selesai untuk ${email}. ${processSummary(result.processed)}.`;
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <ZohoStat icon={connectionStatus === "connected" ? CheckCircle2 : XCircle} label="Connection" value={statusLabel} tone={connectionStatus === "connected" ? "bg-leaf-50 text-leaf-700" : connectionStatus === "failed" ? "bg-coral-50 text-coral-600" : "bg-slate-100 text-slate-600"} />
        <ZohoStat icon={Clock3} label="Last Success" value={formatShortDate(dashboard?.last_successful_sync)} tone="bg-ocean-50 text-ocean-700" />
        <ZohoStat icon={ClipboardList} label="Pending Queue" value={`${dashboard?.queue_pending ?? 0}`} tone="bg-sun-50 text-amber-700" />
        <ZohoStat icon={XCircle} label="Failed Queue" value={`${dashboard?.queue_failed ?? 0}`} tone="bg-coral-50 text-coral-600" />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-ocean-700">Zoho Campaigns</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Marketing / Zoho Sync</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Master list: PKSK Academy Users. Source of truth kekal Supabase.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="secondary-button" onClick={loadDashboard} disabled={Boolean(busyAction)}>
              <RefreshCw size={18} aria-hidden="true" />
              Refresh
            </button>
            <button type="button" className="primary-button" onClick={handleTestConnection} disabled={Boolean(busyAction)}>
              <ShieldCheck size={18} aria-hidden="true" />
              {busyAction === "test" ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>

        {connection ? (
          <div className="mt-5 grid gap-3 rounded-2xl border border-leaf-100 bg-leaf-50 p-4 text-sm font-bold text-leaf-800 sm:grid-cols-3">
            <span>Token OK</span>
            <span>Active: {connection.counts?.active ?? "-"}</span>
            <span>Unsubscribed: {connection.counts?.unsubscribed ?? "-"}</span>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.58fr_0.42fr]">
        <div className="rounded-2xl bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-950">Backfill</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Preview dahulu, kemudian run batch kecil.</p>
            </div>
            <label className="grid gap-1 text-sm font-black text-slate-700">
              Batch size
              <input className="field max-w-36" type="number" min={1} max={100} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))} />
            </label>
          </div>

          {currentPreview ? <PreviewGrid preview={currentPreview} /> : <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">Preview belum dijana.</p>}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="secondary-button" onClick={handlePreviewBackfill} disabled={Boolean(busyAction)}>
              <Search size={18} aria-hidden="true" />
              {busyAction === "preview" ? "Preview..." : "Preview Backfill"}
            </button>
            <button type="button" className="primary-button" onClick={handleRunBackfill} disabled={Boolean(busyAction)}>
              <Play size={18} aria-hidden="true" />
              {busyAction === "backfill" ? "Running..." : "Run Backfill"}
            </button>
            <button type="button" className="secondary-button" onClick={handleProcessQueue} disabled={Boolean(busyAction)}>
              <Zap size={18} aria-hidden="true" />
              {busyAction === "process" ? "Processing..." : "Process Queue"}
            </button>
            <button type="button" className="secondary-button border-coral-100 bg-coral-50 text-coral-600" onClick={handleRetryFailed} disabled={Boolean(busyAction) || (dashboard?.queue_failed ?? 0) === 0}>
              <RefreshCw size={18} aria-hidden="true" />
              {busyAction === "retry" ? "Retrying..." : "Retry Failed"}
            </button>
          </div>

          {lastProcess ? <p className="mt-4 rounded-2xl bg-ocean-50 px-4 py-3 text-sm font-black text-ocean-800">{processSummary(lastProcess)}</p> : null}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-soft">
          <h3 className="text-xl font-black text-slate-950">Sync Single User</h3>
          <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleSingleSync}>
            <input className="field" type="email" value={singleEmail} onChange={(event) => setSingleEmail(event.target.value)} placeholder="nama@email.com" />
            <button type="submit" className="primary-button" disabled={Boolean(busyAction)}>
              <Send size={18} aria-hidden="true" />
              {busyAction === "single" ? "Sync..." : "Sync"}
            </button>
          </form>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ZohoMiniMetric label="Succeeded" value={`${dashboard?.queue_succeeded ?? 0}`} />
            <ZohoMiniMetric label="Skipped" value={`${dashboard?.queue_skipped ?? 0}`} />
            <ZohoMiniMetric label="Processing" value={`${dashboard?.queue_processing ?? 0}`} />
            <ZohoMiniMetric label="Last Failed" value={formatShortDate(dashboard?.last_failed_sync)} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
            <MailCheck size={22} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-950">Zoho Field Mapping</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Field API key yang berjaya ditemui daripada Zoho akan muncul di sini.</p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">API Field</th>
                <th className="px-4 py-3">Field ID</th>
                <th className="px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fieldMappings.map((field) => (
                <tr key={field.field_label}>
                  <td className="px-4 py-3 font-black text-slate-900">{field.field_label}</td>
                  <td className="px-4 py-3 text-slate-600">{field.field_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{field.field_id ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatShortDate(field.last_verified_at)}</td>
                </tr>
              ))}
              {fieldMappings.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm font-semibold text-slate-500" colSpan={4}>
                    Mapping belum disahkan.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PreviewGrid({ preview }: { preview: ZohoBackfillPreview }) {
  const items = [
    ["Total Auth Users", preview.total_auth_users],
    ["With Profile", preview.with_profile],
    ["Eligible", preview.eligible_users],
    ["Prospects", preview.prospects],
    ["Premium", preview.premium],
    ["Expired", preview.expired],
    ["Blocked", preview.blocked],
    ["Invalid Email", preview.invalid_email],
    ["Admin Excluded", preview.admin_internal_excluded],
    ["Consent True", preview.marketing_consent_true],
    ["Consent Missing", preview.marketing_consent_false_or_unknown],
    ["Unsubscribed", preview.unsubscribed],
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <ZohoMiniMetric key={label} label={String(label)} value={`${value}`} />
      ))}
    </div>
  );
}

function ZohoStat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-black text-slate-950">{value}</p>
        </div>
      </div>
    </article>
  );
}

function ZohoMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function processSummary(result?: ZohoProcessResult | null): string {
  if (!result) {
    return "Tiada queue diproses.";
  }
  return `${result.processed} processed, ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`;
}

function formatShortDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Zoho Sync belum dapat diproses.";
}
