import {
  BellRing,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEED } from "@/data/feed";
import { ALERTS } from "@/data/alerts";
import { formatMW } from "@/lib/format";

export type ViewId = "chat" | "dashboard" | "maintenance" | "alerts";

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Assistant", icon: MessageSquare },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "alerts", label: "Alerts", icon: BellRing },
];

export function Sidebar({
  view,
  onViewChange,
  open,
  onToggle,
}: {
  view: ViewId;
  onViewChange: (v: ViewId) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const alertCount = ALERTS.length;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200",
        open ? "w-60" : "w-16"
      )}
    >
      <div
        className={cn(
          "flex h-[60px] items-center border-b border-border",
          open ? "gap-2.5 px-4" : "justify-center px-2"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Zap className="h-4 w-4" aria-hidden="true" />
        </span>
        {open ? (
          <>
            <div className="min-w-0 flex-1 leading-none">
              <p className="heading-tight text-[14.5px] font-semibold text-text">
                {FEED.meta.operator}
              </p>
              <p className="mt-1 truncate text-[11px] text-text-subtle">Plant Intelligence</p>
            </div>
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={onToggle}
              className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {!open ? (
        <div className="flex justify-center border-b border-border py-2">
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={onToggle}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <nav aria-label="Console views" className={cn("flex-1 space-y-0.5 py-3", open ? "px-3" : "px-2")}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={open ? undefined : item.label}
              title={open ? undefined : item.label}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                open ? "justify-start" : "justify-center",
                active
                  ? "bg-surface-overlay text-text"
                  : "text-text-muted hover:bg-surface-raised hover:text-text"
              )}
            >
              <Icon
                className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-text-subtle")}
                aria-hidden="true"
              />
              {open ? <span>{item.label}</span> : null}
              {item.id === "alerts" && alertCount > 0 ? (
                open ? (
                  <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-50 px-1 text-[10.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                    {alertCount}
                  </span>
                ) : (
                  <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                )
              ) : null}
            </button>
          );
        })}
      </nav>

      {open ? (
        <div className="border-t border-border px-4 py-3.5">
          <p className="truncate text-[12px] font-medium text-text">
            {FEED.meta.operator} thermal fleet
          </p>
          <p className="mt-0.5 text-[11px] text-text-subtle">
            {FEED.meta.plantCount} plants · {FEED.meta.unitCount} units ·{" "}
            {formatMW(FEED.meta.installedMw)}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
            Telemetry live
          </p>
          <p className="mt-3 border-t border-border pt-2.5 text-[10.5px] text-text-subtle">
            Powered by <span className="font-medium text-text-muted">Ballast</span>
          </p>
        </div>
      ) : null}
    </aside>
  );
}
