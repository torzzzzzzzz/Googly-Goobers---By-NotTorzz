import { NavLink } from "react-router-dom";
import { History, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Settings, Star } from "lucide-react";
import { CATEGORIES, TOOLS, TOOL_BY_ID } from "../../lib/tools";
import { useFavorites } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";
import { cx } from "../ui";
import { Logo } from "./Logo";

function Item({ to, icon: Icon, label, collapsed, end }: { to: string; icon: any; label: string; collapsed: boolean; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center gap-3 rounded-xl px-3 py-[0.45rem] text-[0.86rem] font-medium transition",
          collapsed && "justify-center px-0",
          isActive ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="accent-gradient absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />}
          <Icon className={cx("size-[1.05rem] shrink-0 transition", isActive ? "text-accent" : "text-faint group-hover:text-ink-2")} />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const fav = useFavorites();
  const { settings } = useSettings();
  const favorites = (fav.data?.favorites ?? []).filter((id) => TOOL_BY_ID[id]);
  const name = settings?.profile.name || "You";

  return (
    <aside className={cx("sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-line bg-bg-2/80 backdrop-blur-xl transition-[width] duration-200", collapsed ? "w-[68px]" : "w-[252px]")}>
      <div className={cx("flex h-16 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        <NavLink to="/" aria-label="TORZ AI dashboard">
          <Logo collapsed={collapsed} />
        </NavLink>
        {!collapsed && (
          <button onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar" className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink">
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar" className="mx-auto mb-2 rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink">
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        <div className="space-y-0.5">
          <Item to="/" end icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} />
          <Item to="/history" icon={History} label="History" collapsed={collapsed} />
        </div>

        {favorites.length > 0 && (
          <div>
            {!collapsed ? (
              <div className="label mb-1.5 flex items-center gap-1.5 px-3">
                <Star className="size-3 fill-current text-warn" /> Favorites
              </div>
            ) : (
              <div className="mx-auto mb-1.5 h-px w-6 bg-line" />
            )}
            <div className="space-y-0.5">
              {favorites.map((id) => {
                const t = TOOL_BY_ID[id];
                return <Item key={`fav-${id}`} to={t.path} icon={t.icon} label={t.name} collapsed={collapsed} />;
              })}
            </div>
          </div>
        )}

        {CATEGORIES.map((c) => (
          <div key={c.id}>
            {!collapsed ? <div className="label mb-1.5 px-3">{c.label}</div> : <div className="mx-auto mb-1.5 h-px w-6 bg-line" />}
            <div className="space-y-0.5">
              {TOOLS.filter((t) => t.category === c.id).map((t) => (
                <Item key={t.id} to={t.path} icon={t.icon} label={t.name} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cx("flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2", isActive && "bg-surface-2", collapsed && "justify-center")
          }
          title="Settings"
        >
          <div className="accent-gradient grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-accent-ink">{name.slice(0, 1).toUpperCase()}</div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.86rem] font-semibold text-ink">{name}</div>
                <div className="text-[0.72rem] text-muted">Private workspace</div>
              </div>
              <Settings className="size-4 text-faint" />
            </>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
