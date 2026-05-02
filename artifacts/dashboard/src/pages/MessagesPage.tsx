import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  MessageCircle,
  Send,
  ShoppingCart,
  Phone,
  ChevronLeft,
  Bot,
  User,
  Store,
  FlaskConical,
  X,
  Loader2,
  CheckCircle2,
  PlusCircle,
  Search,
} from "lucide-react";
import { formatTimeAgo, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import NewOrderDialog from "@/components/NewOrderDialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Conversation {
  customerId: number;
  customerName: string;
  customerPhone: string;
  totalOrders: number;
  lastMessage: string | null;
  lastMessageDirection: string;
  lastMessageAt: string;
  isOrderMessage: boolean;
  inboundCount: number;
  hasUnread: boolean;
}

interface Message {
  id: number;
  direction: string;
  messageType: string;
  body: string | null;
  isOrderMessage: boolean;
  createdAt: string;
  orderId: number | null;
  order: {
    id: number;
    status: string;
    totalAmount: string;
    notes: string | null;
  } | null;
}

interface Thread {
  customer: {
    id: number;
    name: string | null;
    whatsappName: string | null;
    whatsappPhone: string;
    totalOrders: number;
    totalSpend: string;
  };
  messages: Message[];
}

function ConversationItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3.5 border-b border-border transition-colors",
        isSelected
          ? "bg-primary/8 border-l-2 border-l-primary"
          : "hover:bg-accent/60"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={cn("font-semibold text-sm truncate", conv.lastMessageDirection === "inbound" && !isSelected ? "text-foreground" : "text-foreground")}>
              {conv.customerName}
            </span>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {conv.hasUnread && (
                <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-orange-500 shrink-0 animate-pulse" title="Unread message" />
              )}
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(conv.lastMessageAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {conv.lastMessageDirection === "outbound" && (
              <Store className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <p className={cn("text-xs truncate", conv.lastMessageDirection === "inbound" ? "text-foreground font-medium" : "text-muted-foreground")}>
              {conv.lastMessage ?? "No messages yet"}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {conv.totalOrders > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                <ShoppingCart className="h-3 w-3" />
                {conv.totalOrders} order{conv.totalOrders !== 1 ? "s" : ""}
              </span>
            )}
            {conv.isOrderMessage && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                <Bot className="h-3 w-3" />
                AI order
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isInbound = msg.direction === "inbound";

  return (
    <div
      className={cn(
        "flex items-end gap-2 mb-3",
        isInbound ? "justify-start" : "justify-end"
      )}
    >
      {isInbound && (
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mb-0.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className={cn("max-w-[75%]", isInbound ? "items-start" : "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isInbound
              ? "bg-accent text-foreground rounded-tl-sm"
              : "bg-primary text-primary-foreground rounded-tr-sm"
          )}
        >
          {msg.body ? (
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          ) : (
            <p className="italic opacity-60">[{msg.messageType}]</p>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 mt-1",
            isInbound ? "justify-start" : "justify-end"
          )}
        >
          <span className="text-[10px] text-muted-foreground">
            {formatTimeAgo(msg.createdAt)}
          </span>
          {msg.isOrderMessage && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
              <Bot className="h-2.5 w-2.5" />
              order detected
            </span>
          )}
        </div>
        {msg.order && (
          <Link href={`/orders/${msg.order.id}`}>
            <div className="mt-1.5 inline-flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent/50 transition-colors cursor-pointer">
              <ShoppingCart className="h-3 w-3 text-primary" />
              <span className="font-medium text-foreground">
                Order #{msg.order.id}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={cn(
                  "font-medium capitalize",
                  msg.order.status === "paid" || msg.order.status === "delivered"
                    ? "text-green-600"
                    : msg.order.status === "cancelled"
                    ? "text-red-500"
                    : "text-amber-600"
                )}
              >
                {msg.order.status}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">
                KES {Math.round(Number(msg.order.totalAmount)).toLocaleString()}
              </span>
            </div>
          </Link>
        )}
      </div>
      {!isInbound && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mb-0.5">
          <Store className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

function SimulatorPanel({
  onSimulated,
}: {
  onSimulated: (customerId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("0712345678");
  const [name, setName] = useState("Test Customer");
  const [message, setMessage] = useState("");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/webhooks/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim(), message: message.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Simulation failed");
      }
      return r.json() as Promise<{ ok: boolean; customerId: number | null; reply: string | null }>;
    },
    onSuccess: (data) => {
      setLastReply(data.reply);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (data.customerId) {
        setTimeout(() => onSimulated(data.customerId!), 400);
      }
    },
  });

  if (!open) {
    return (
      <div className="mx-4 mb-3 mt-1">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors rounded-lg px-3 py-2"
        >
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          Test your WhatsApp bot — simulate an inbound message
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 mt-1 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200 bg-amber-100/60">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
          <FlaskConical className="h-3.5 w-3.5" />
          WhatsApp Bot Simulator
        </div>
        <button
          onClick={() => { setOpen(false); setLastReply(null); }}
          className="p-0.5 rounded hover:bg-amber-200 transition-colors text-amber-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
              className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-md border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Test Customer"
              className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-md border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Message to send</label>
          <div className="flex gap-1.5 mt-0.5">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (message.trim() && !simulateMutation.isPending) simulateMutation.mutate();
                }
              }}
              placeholder="e.g. nataka 2 Brookside 500ml na 1 Unga 2kg…"
              rows={2}
              className="flex-1 resize-none px-2.5 py-1.5 text-xs rounded-md border border-amber-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              onClick={() => simulateMutation.mutate()}
              disabled={!message.trim() || simulateMutation.isPending}
              className="flex items-center justify-center w-9 h-9 self-end rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors shrink-0"
            >
              {simulateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Quick test prompts */}
        <div className="flex flex-wrap gap-1">
          {[
            "nataka 2 maziwa na 1 mkate",
            "niletee orodha ya bidhaa",
            "order yangu iko wapi?",
            "habari! mnauza nini?",
          ].map((p) => (
            <button
              key={p}
              onClick={() => setMessage(p)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {simulateMutation.isError && (
          <p className="text-[11px] text-red-600">
            {(simulateMutation.error as Error).message}
          </p>
        )}

        {lastReply && (
          <div className="rounded-lg bg-white border border-amber-200 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Bot replied:
            </div>
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{lastReply}</p>
          </div>
        )}

        <p className="text-[10px] text-amber-600">
          Sends a fake WhatsApp message through the AI parser · Creates customer + order automatically · Opens thread below
        </p>
      </div>
    </div>
  );
}

const QUICK_REPLIES = [
  {
    label: "✅ Confirmed",
    text: "Asante! Order yako imethibitishwa. Tunaandaa sasa hivi. ✅\nThank you! Your order is confirmed. We're preparing it now.",
  },
  {
    label: "📦 Ready",
    text: "Bidhaa zako ziko tayari kuchukuliwa! 📦\nYour order is ready for pickup!",
  },
  {
    label: "🚚 On the way",
    text: "Bidhaa zako ziko njiani! Utapata hivi karibuni. 🚚\nYour order is on the way! You'll receive it shortly.",
  },
  {
    label: "❌ Out of stock",
    text: "Samahani, bidhaa hiyo imekwisha kwa sasa. 😔\nSorry, that item is currently out of stock. We'll notify you when it's available again.",
  },
  {
    label: "💰 Pay Mpesa",
    text: "Tafadhali lipa kwa Mpesa:\nPlease pay via Mpesa:\nBusiness No: 522533\nA/C No: [Order Number]\nAmount: KES ",
  },
  {
    label: "⏰ Delay",
    text: "Samahani, kutakuwa na ucheleweshaji mdogo. Tutakuarifiwa haraka iwezekanavyo. 🙏\nWe apologize for a short delay. We'll update you as soon as possible.",
  },
];

export default function MessagesPage() {
  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  const initCustomerId = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    const v = p.get("customerId");
    return v ? Number(v) : null;
  }, [searchStr]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(initCustomerId);
  const [replyText, setReplyText] = useState("");
  const [showThread, setShowThread] = useState(initCustomerId !== null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [inboxSearch, setInboxSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: convsData, isLoading: convsLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/messages/conversations`);
      return r.json() as Promise<{ conversations: Conversation[] }>;
    },
    refetchInterval: 10_000,
  });

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["thread", selectedCustomerId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/messages/thread/${selectedCustomerId}`);
      return r.json() as Promise<Thread>;
    },
    enabled: selectedCustomerId !== null,
    refetchInterval: 8_000,
  });

  const replyMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(
        `${BASE}/api/messages/thread/${selectedCustomerId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      if (!r.ok) throw new Error("Failed to send");
      return r.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["thread", selectedCustomerId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [threadData?.messages]);

  const allConversations = convsData?.conversations ?? [];
  const conversations = inboxSearch.trim()
    ? allConversations.filter((c) => {
        const q = inboxSearch.toLowerCase();
        return (
          (c.customerName ?? "").toLowerCase().includes(q) ||
          c.customerPhone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
          (c.lastMessage ?? "").toLowerCase().includes(q)
        );
      })
    : allConversations;
  const selectedConv = allConversations.find((c) => c.customerId === selectedCustomerId);

  const markReadMutation = useMutation({
    mutationFn: async (customerId: number) => {
      await fetch(`${BASE}/api/messages/thread/${customerId}/mark-read`, { method: "PATCH" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  function selectConversation(id: number) {
    setSelectedCustomerId(id);
    setShowThread(true);
    markReadMutation.mutate(id);
  }

  function handleSend() {
    const text = replyText.trim();
    if (!text || replyMutation.isPending) return;
    replyMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full bg-background" style={{ height: "calc(100vh - 0px)" }}>
      {/* Conversation list */}
      <div
        className={cn(
          "flex flex-col w-full md:w-80 lg:w-96 border-r border-border shrink-0",
          showThread ? "hidden md:flex" : "flex"
        )}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Inbox</h1>
            {allConversations.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {conversations.length !== allConversations.length
                  ? `${conversations.length} of ${allConversations.length}`
                  : `${allConversations.length} conversation${allConversations.length !== 1 ? "s" : ""}`}
              </span>
            )}
          </div>
          {allConversations.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={inboxSearch}
                onChange={(e) => setInboxSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full pl-8 pr-3 py-1.5 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              />
            </div>
          )}
        </div>

        {/* Simulator */}
        <SimulatorPanel onSimulated={(id) => selectConversation(id)} />

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Loading conversations…
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground">
                WhatsApp messages from customers will appear here automatically.
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.customerId}
                conv={conv}
                isSelected={conv.customerId === selectedCustomerId}
                onClick={() => selectConversation(conv.customerId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Thread panel */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0",
          !showThread ? "hidden md:flex" : "flex"
        )}
      >
        {!selectedCustomerId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Select a conversation</p>
              <p className="text-sm text-muted-foreground mt-1">
                Pick a customer from the left to see the full chat thread.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-background">
              <button
                className="md:hidden p-1.5 rounded-md hover:bg-accent mr-1"
                onClick={() => setShowThread(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">
                  {selectedConv?.customerName ?? threadData?.customer.name ?? "Customer"}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhone(
                    selectedConv?.customerPhone ??
                      threadData?.customer.whatsappPhone ??
                      ""
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(selectedConv?.totalOrders ?? 0) > 0 && (
                  <div className="hidden sm:flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">
                    <ShoppingCart className="h-3 w-3" />
                    {selectedConv?.totalOrders} orders
                  </div>
                )}
                <button
                  onClick={() => setNewOrderOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New Order</span>
                </button>
                <Link href={`/customers`}>
                  <button className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                    View profile →
                  </button>
                </Link>
              </div>
            </div>
            <NewOrderDialog
              open={newOrderOpen}
              onClose={() => setNewOrderOpen(false)}
              initialCustomerId={selectedCustomerId}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {threadLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  Loading messages…
                </div>
              ) : (threadData?.messages.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  No messages yet
                </div>
              ) : (
                <>
                  {threadData!.messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Reply box */}
            <div className="border-t border-border px-4 pt-2.5 pb-3 bg-background space-y-2">
              {/* Quick reply templates */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.label}
                    onClick={() => setReplyText(qr.text)}
                    title={qr.text}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-muted/60 hover:bg-accent hover:border-primary/30 text-foreground transition-colors"
                  >
                    {qr.label}
                  </button>
                ))}
              </div>

              {replyMutation.isError && (
                <p className="text-xs text-red-500">
                  Failed to send. WhatsApp credentials may not be configured yet.
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0",
                    replyText.trim() && !replyMutation.isPending
                      ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                      : "bg-accent text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground px-0.5">
                Messages are sent via WhatsApp Cloud API · Replies appear in customer's WhatsApp
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
