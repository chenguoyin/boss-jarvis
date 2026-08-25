import { SquareDashed } from "lucide-react";
import type { AppSection } from "@/lib/sections";

interface Props {
  section: AppSection;
}

export default function PlaceholderView({ section }: Props) {
  return (
    <div className="jv-placeholder">
      <SquareDashed size={40} strokeWidth={1.5} />
      <div className="jv-title" style={{ color: "var(--jv-text)" }}>
        {section.title}
      </div>
      <div className="jv-body" style={{ color: "var(--jv-muted)" }}>
        该模块尚未接入真实数据，将在后续阶段实现。
      </div>
    </div>
  );
}
