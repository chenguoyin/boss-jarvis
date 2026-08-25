import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/config";

const THEMES: { value: Theme; icon: typeof Monitor; label: string }[] = [
  { value: "system", icon: Monitor, label: "系统" },
  { value: "light", icon: Sun, label: "浅色" },
  { value: "dark", icon: Moon, label: "深色" },
];

interface Props {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export default function ThemePicker({ theme, onChange }: Props) {
  return (
    <div
      className="jv-theme-picker"
      role="group"
      aria-label="主题选择"
    >
      {THEMES.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            className="jv-theme-picker-btn"
            data-active={active || undefined}
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(value)}
          >
            <Icon size={15} strokeWidth={active ? 2.5 : 2} />
          </button>
        );
      })}
    </div>
  );
}
