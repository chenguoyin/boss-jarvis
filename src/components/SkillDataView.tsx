import { SquareDashed } from "lucide-react";
import type { AppSection } from "@/lib/sections";
import { isMissing } from "@/lib/contract";
import type { SkillFailure } from "@/hooks/useSkillData";

interface Props {
  section: AppSection;
  envelopes: Record<string, import("@/lib/contract").SkillEnvelope | null>;
  failures: SkillFailure[];
}

function displayValue(value: unknown): string {
  if (isMissing(value)) return "未获取";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "未获取" : value;
  return "未获取";
}

export default function SkillDataView({ section, envelopes, failures }: Props) {
  const loaded = section.skills
    .map((skill) => ({ skill, envelope: envelopes[skill] }))
    .filter((entry) => entry.envelope !== undefined);

  return (
    <div className="jv-placeholder">
      {failures.length > 0 && (
        <div className="jv-failure-banner" role="status">
          {failures.map((failure) => (
            <div key={failure.skill} className="jv-body jv-failure-text">
              {failure.error}
            </div>
          ))}
        </div>
      )}
      <SquareDashed size={40} strokeWidth={1.5} />
      <div className="jv-title" style={{ color: "var(--jv-text)" }}>
        {section.title}
      </div>
      {loaded.length === 0 ? (
        <div className="jv-body" style={{ color: "var(--jv-muted)" }}>
          尚未获取数据，请点击右上角刷新。
        </div>
      ) : (
        <div className="jv-skill-status-list">
          {loaded.map(({ skill, envelope }) => (
            <div key={skill} className="jv-skill-status-row">
              <span className="jv-body jv-skill-status-name">{skill}</span>
              <span className="jv-body jv-skill-status-value">
                {envelope === null
                  ? "未获取"
                  : `条目 ${displayValue(envelope.count)} · ${displayValue(envelope.fetchedAt)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
