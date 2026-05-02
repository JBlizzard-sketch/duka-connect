import { useState } from "react";
import {
  useListBroadcasts,
  useCreateBroadcast,
  getListBroadcastsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format";
import { Radio, Plus, Loader2, Sparkles, ChevronDown, ChevronUp, Smartphone } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TEMPLATES: { category: string; label: string; message: string }[] = [
  {
    category: "Sale",
    label: "Flash Sale",
    message: "🔥 *Flash Sale — Leo Tu!*\n\nPata punguzo ya *20%* kwa bidhaa zote leo. Agiza sasa kupitia WhatsApp — haraka kabla ya muda kwisha! ⏰",
  },
  {
    category: "Sale",
    label: "Weekend Offer",
    message: "🎉 *Wikendi Special!*\n\nNunua bidhaa zaidi ya KES 1,000 na upate *delivery bure* — wikendi hii tu. Agiza sasa! 📦",
  },
  {
    category: "Stock",
    label: "New Arrivals",
    message: "✅ *Stoo Mpya Imefika!*\n\nBidhaa mpya zimewasili dukani — maziwa safi, mkate, na zaidi. Agiza sasa kabla haijaisha! 🛒",
  },
  {
    category: "Stock",
    label: "Back in Stock",
    message: "📦 *Bidhaa Iliyokosekana Imerudi!*\n\nHabari njema — bidhaa uliyokuwa ukitafuta ipo tena. Agiza haraka kabla hazijaisha!",
  },
  {
    category: "Loyalty",
    label: "Points Reminder",
    message: "⭐ *Una Pointi za Zawadi!*\n\nAsante kwa ununuzi wako. Pointi zako zinaweza kupunguza bei ya order yako ijayo. Agiza leo na utumie pointi zako!",
  },
  {
    category: "Reminder",
    label: "We Miss You",
    message: "💬 *Tumekukosa!*\n\nMuda mrefu bila kukuona. Karibu tena — bidhaa zetu bado zinasubiri. Agiza sasa kupitia WhatsApp hii! 🙏",
  },
  {
    category: "Reminder",
    label: "Holiday Greeting",
    message: "🎊 *Salamu za Likizo!*\n\nTunakutakia likizo njema. Tuko wazi na tunasubiri kukuhudumia. Agiza bidhaa zako sasa! 🛍️",
  },
];

const SEGMENTS: { value: "all" | "recent" | "top_customers" | "loyal" | "vip" | "new_customers"; label: string; desc: string }[] = [
  { value: "all", label: "All Customers", desc: "Message everyone" },
  { value: "recent", label: "Recent (30 days)", desc: "Ordered in last month" },
  { value: "top_customers", label: "Top Spenders", desc: "Over KES 5,000 spent" },
  { value: "loyal", label: "Loyal (50+ pts)", desc: "High loyalty points" },
  { value: "vip", label: "VIP Customers", desc: "10+ orders or KES 10K+" },
  { value: "new_customers", label: "New Customers", desc: "1–2 orders only" },
];

const STATUS_COLORS: Record<string, string> = {
  sent: "text-green-700 bg-green-100",
  sending: "text-blue-700 bg-blue-100",
  draft: "text-gray-600 bg-gray-100",
  failed: "text-red-700 bg-red-100",
};

function parseWhatsApp(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/~(.*?)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br/>");
}

function WhatsAppPreview({ message }: { message: string }) {
  const html = parseWhatsApp(message || "");
  return (
    <div className="flex flex-col h-full">
      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Smartphone className="h-3.5 w-3.5" />
        Preview
      </p>
      {/* Phone frame */}
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden border-2 border-gray-300 shadow-md bg-gray-100 min-h-[280px] max-h-[380px]">
        {/* WhatsApp header bar */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#075E54" }}>
          <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center text-white text-[10px] font-bold">D</div>
          <div>
            <p className="text-white text-xs font-semibold leading-none">Duka</p>
            <p className="text-white/70 text-[9px] leading-none mt-0.5">Business Account</p>
          </div>
        </div>
        {/* Chat area */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3"
          style={{ background: "#ECE5DD" }}
        >
          {message.trim() ? (
            <div className="flex justify-end">
              <div
                className="max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-xs shadow-sm"
                style={{ background: "#DCF8C6", color: "#111" }}
              >
                <p
                  className="leading-relaxed whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                <p className="text-right text-[9px] mt-1 opacity-60">12:00 ✓✓</p>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400 mt-6">Message preview will appear here</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBroadcastDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<"all" | "recent" | "top_customers" | "loyal" | "vip" | "new_customers">("all");
  const [showTemplates, setShowTemplates] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: segmentPreview } = useQuery({
    queryKey: ["broadcasts", "segment-preview"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/broadcasts/segment-preview`);
      return r.json() as Promise<{ segments: { segment: string; customerCount: number }[] }>;
    },
    staleTime: 60_000,
    enabled: open,
  });
  const segmentCounts = Object.fromEntries(
    (segmentPreview?.segments ?? []).map((s) => [s.segment, s.customerCount])
  );

  const templateCategories = Array.from(new Set(TEMPLATES.map((t) => t.category)));

  const createBroadcast = useCreateBroadcast({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setMessage("");
        setSegment("all");
        setScheduleAt("");
        queryClient.invalidateQueries({ queryKey: getListBroadcastsQueryKey() });
        toast({ title: scheduleAt ? "Broadcast scheduled" : "Broadcast sent" });
      },
      onError: () => toast({ title: "Failed to send broadcast", variant: "destructive" }),
    },
  });

  const charCount = message.length;
  const isOverLimit = charCount > 4096;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid="button-new-broadcast"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Broadcast
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>New Broadcast</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
          {/* Left: compose */}
          <div className="space-y-4">
            {/* Segment */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Send to
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.value}
                    data-testid={`segment-${s.value}`}
                    onClick={() => setSegment(s.value)}
                    className={cn(
                      "p-2.5 rounded-lg border text-left transition-colors",
                      segment === s.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-medium">{s.label}</p>
                      {segmentCounts[s.value] !== undefined && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground leading-none">
                          {segmentCounts[s.value]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Templates */}
            <div>
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Use a template
                {showTemplates ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showTemplates && (
                <div className="mt-2 space-y-2">
                  {templateCategories.map((cat) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        {cat}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {TEMPLATES.filter((t) => t.category === cat).map((t) => (
                          <button
                            key={t.label}
                            type="button"
                            onClick={() => {
                              setMessage(t.message);
                              setShowTemplates(false);
                            }}
                            className="px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted hover:border-primary/40 transition-colors"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Message</label>
                <span
                  className={cn("text-xs", isOverLimit ? "text-red-500" : "text-muted-foreground")}
                >
                  {charCount}/4096
                </span>
              </div>
              <textarea
                data-testid="input-broadcast-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={"Habari! Tuna offer special leo — buy 2 get 1 free.\n\nUse *bold* and _italic_ formatting."}
                rows={6}
                className={cn(
                  "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none",
                  isOverLimit ? "border-red-400" : "border-input"
                )}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use <code className="text-[10px]">*bold*</code>, <code className="text-[10px]">_italic_</code>, <code className="text-[10px]">~strikethrough~</code>
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {scheduleAt && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Will send at {new Date(scheduleAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
            </div>
            <button
              data-testid="button-send-broadcast"
              disabled={!message.trim() || isOverLimit || createBroadcast.isPending}
              onClick={() =>
                createBroadcast.mutate({
                  data: {
                    message: message.trim(),
                    segment,
                    ...(scheduleAt ? { scheduleAt } : {}),
                  } as Parameters<typeof createBroadcast.mutate>[0]["data"],
                })
              }
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {createBroadcast.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {scheduleAt ? "Scheduling..." : "Sending..."}
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" />
                  {scheduleAt ? "Schedule Broadcast" : "Send Broadcast"}
                </>
              )}
            </button>
          </div>

          {/* Right: WhatsApp preview */}
          <WhatsAppPreview message={message} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BroadcastsPage() {
  const { data, isLoading } = useListBroadcasts({ limit: 30 } as Parameters<typeof useListBroadcasts>[0]);
  const broadcasts = data?.broadcasts ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Broadcasts</h1>
        <NewBroadcastDialog />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="text-center py-16">
          <Radio className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Send a message to all or a segment of your customers at once.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => (
            <Card key={b.id} data-testid={`card-broadcast-${b.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{b.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground capitalize">
                        {b.segment?.replace(/_/g, " ")}
                      </span>
                      <span className="text-border text-xs">|</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(b.sentAt ?? b.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded text-xs font-medium",
                        STATUS_COLORS[b.status ?? "draft"] ?? "text-gray-600 bg-gray-100"
                      )}
                    >
                      {b.status}
                    </span>
                    {b.recipientCount !== null && (
                      <p className="text-xs text-muted-foreground">
                        {b.sentCount ?? 0}/{b.recipientCount} sent
                      </p>
                    )}
                    {b.failedCount !== null && b.failedCount > 0 && (
                      <p className="text-xs text-red-500">{b.failedCount} failed</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
