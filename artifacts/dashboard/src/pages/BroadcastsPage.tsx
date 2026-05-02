import { useState } from "react";
import {
  useListBroadcasts,
  useCreateBroadcast,
  getListBroadcastsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format";
import { Radio, Plus, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SEGMENTS: { value: "all" | "recent" | "top_customers" | "loyal"; label: string; desc: string }[] = [
  { value: "all", label: "All Customers", desc: "Message everyone" },
  { value: "recent", label: "Recent (30 days)", desc: "Ordered in last month" },
  { value: "top_customers", label: "Top Spenders", desc: "Over KES 5,000 spent" },
  { value: "loyal", label: "Loyal (50+ pts)", desc: "High loyalty points" },
];

const STATUS_COLORS: Record<string, string> = {
  sent: "text-green-700 bg-green-100",
  sending: "text-blue-700 bg-blue-100",
  draft: "text-gray-600 bg-gray-100",
  failed: "text-red-700 bg-red-100",
};

function NewBroadcastDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<"all" | "recent" | "top_customers" | "loyal">("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createBroadcast = useCreateBroadcast({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setMessage("");
        setSegment("all");
        queryClient.invalidateQueries({ queryKey: getListBroadcastsQueryKey() });
        toast({ title: "Broadcast sent" });
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Broadcast</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
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
                  <p className="text-xs font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
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
              placeholder="Habari! Tuna offer special leo — buy 2 get 1 free on all medicines. Wasiliana nasi sasa!"
              rows={5}
              className={cn(
                "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none",
                isOverLimit ? "border-red-400" : "border-input"
              )}
            />
          </div>

          <button
            data-testid="button-send-broadcast"
            disabled={!message.trim() || isOverLimit || createBroadcast.isPending}
            onClick={() =>
              createBroadcast.mutate({ data: { message: message.trim(), segment } })
            }
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {createBroadcast.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Radio className="h-4 w-4" />
                Send Broadcast
              </>
            )}
          </button>
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
