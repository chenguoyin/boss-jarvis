import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { appSections } from "@/lib/sections";
import brandIcon from "@/assets/brand-icon.png";

interface NavButtonProps {
  id: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

function NavButton({ title, icon: Icon, active, badge, onClick }: NavButtonProps) {
  const [hovering, setHovering] = useState(false);

  return (
    <button
      type="button"
      className="jv-nav-btn"
      data-active={active || undefined}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
    >
      <span
        className="jv-nav-btn-bg"
        data-active={active || undefined}
        data-hover={hovering && !active ? "" : undefined}
      />
      <span className="jv-nav-btn-dot" />
      <Icon
        size={15}
        strokeWidth={active ? 2.2 : 1.8}
        className="jv-nav-btn-icon"
        data-active={active || undefined}
        data-hover={hovering && !active ? "" : undefined}
      />
      {badge !== undefined && (
        <span className="jv-nav-badge">{badge}</span>
      )}
    </button>
  );
}

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  badgeFor?: (id: string) => number | undefined;
  onShowAbout: () => void;
}

export default function NavigationRail({
  selectedId,
  onSelect,
  badgeFor,
  onShowAbout,
}: Props) {
  return (
    <nav className="jv-nav" aria-label="主导航">
      <div className="jv-nav-top-spacer" />
      <div className="jv-nav-scroll">
        <div className="jv-nav-list">
          {appSections.map((section) => (
            <NavButton
              key={section.id}
              id={section.id}
              title={section.title}
              icon={section.icon}
              active={selectedId === section.id}
              badge={badgeFor?.(section.id)}
              onClick={() => onSelect(section.id)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="jv-nav-brand"
        title="关于 Boss Jarvis"
        aria-label="关于 Boss Jarvis"
        onClick={onShowAbout}
      >
        <img
          className="jv-nav-brand-img"
          src={brandIcon}
          alt="Boss Jarvis"
        />
      </button>
    </nav>
  );
}
