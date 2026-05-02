import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart2,
  Radio,
  Settings,
  Menu,
  X,
  Zap,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/orders", icon: ShoppingCart, label: "Orders" },
  { href: "/messages", icon: MessageCircle, label: "Inbox" },
  { href: "/inventory", icon: Package, label: "Inventory" },
  { href: "/customers", icon: Users, label: "Customers" },
  { href: "/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/broadcasts", icon: Radio, label: "Broadcasts" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function useInboxBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/messages/stats");
        if (!res.ok) return;
        const data = (await res.json()) as { recentInbound?: number };
        if (active) setCount(data.recentInbound ?? 0);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return count;
}

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  onClick?: () => void;
}) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);

  return (
    <Link href={href} onClick={onClick}>
      <span
        data-testid={`nav-${label.toLowerCase()}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer select-none",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span
            className={cn(
              "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none",
              isActive
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-amber-500 text-white"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
    </Link>
  );
}

function Sidebar({ inboxBadge, onClose }: { inboxBadge: number; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight text-sidebar-foreground">
          Duka
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            badge={item.href === "/messages" ? inboxBadge : undefined}
            onClick={onClose}
          />
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground">WhatsApp Order Manager</p>
        <p className="text-xs text-muted-foreground">Nairobi, KE</p>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const inboxBadge = useInboxBadge();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border shrink-0">
        <Sidebar inboxBadge={inboxBadge} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-sidebar flex flex-col z-50">
            <Sidebar inboxBadge={inboxBadge} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-accent"
            data-testid="button-mobile-menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-primary">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base tracking-tight">Duka</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
