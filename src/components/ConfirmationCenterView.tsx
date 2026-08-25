import { useState } from "react";
import { Briefcase, Check, ListChecks, ShieldCheck, X } from "lucide-react";
import {
  kindLabel,
  pendingOnly,
  settledOnly,
  stateLabel,
  stateLevel,
  type PendingAction,
} from "@/lib/confirmationCenter";

interface Props {
  actions: PendingAction[];
  executing: boolean;
  progressText: string;
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onConfirmBatch: (ids: string[]) => void;
  onSkipBatch: (ids: string[]) => void;
}

export default function ConfirmationCenterView({
  actions,
  executing,
  progressText,
  onConfirm,
  onSkip,
  onConfirmBatch,
  onSkipBatch,
}: Props) {
  const pending = pendingOnly(actions);
  const settled = settledOnly(actions);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = pending.length > 0 && pending.every((action) => selected.has(action.id));

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="jv-card jv-confirm-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">确认中心</div>
          <div className="jv-caption jv-muted">写操作不自动执行 · 确认后才执行 · 全部留痕可追溯</div>
        </div>
        <span className={"jv-caption jv-confirm-count jv-level-bg-" + (pending.length === 0 ? "normal" : "attention")}>
          {pending.length} 项待确认
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="jv-empty">
          <ShieldCheck size={40} strokeWidth={1.5} className="jv-level-normal" />
          <div className="jv-title">当前没有待确认的写操作</div>
          <div className="jv-body jv-muted">Skill 启停等动作会先进入这里，确认后才执行。</div>
        </div>
      ) : (
        <>
          <div className="jv-confirm-toolbar">
            {progressText !== "" && <span className="jv-caption jv-level-normal jv-confirm-progress">{progressText}</span>}
            <button
              type="button"
              className="jv-caption jv-confirm-plain"
              disabled={executing}
              onClick={() => setSelected(allSelected ? new Set() : new Set(pending.map((action) => action.id)))}
            >
              <ListChecks size={15} strokeWidth={2} />
              {allSelected ? "取消全选" : "全选"}
            </button>
            <span className="jv-caption jv-faint">已选 {selected.size} / {pending.length}</span>
            <span className="jv-confirm-toolbar-spacer" />
            <button
              type="button"
              className="jv-caption jv-confirm-plain"
              disabled={selected.size === 0}
              title="跳过所选"
              onClick={() => {
                onSkipBatch([...selected]);
                setSelected(new Set());
              }}
            >
              <X size={15} strokeWidth={2} />
              跳过所选
            </button>
            <button
              type="button"
              className="jv-caption jv-confirm-primary"
              disabled={selected.size === 0 || executing}
              title="逐项串行执行所选动作，全部留痕"
              onClick={() => {
                onConfirmBatch([...selected]);
                setSelected(new Set());
              }}
            >
              {executing ? "执行中..." : "执行所选"}
              <Check size={15} strokeWidth={2} />
            </button>
          </div>

          {pending.map((action) => (
            <article key={action.id} className="jv-confirm-action">
              <div className="jv-confirm-action-top">
                <button
                  type="button"
                  className="jv-confirm-check"
                  aria-label={selected.has(action.id) ? "取消选中" : "选中"}
                  onClick={() => toggleSelect(action.id)}
                >
                  {selected.has(action.id) ? <Check size={15} strokeWidth={2.4} /> : <span className="jv-confirm-circle" />}
                </button>
                <span className="jv-confirm-icon"><Briefcase size={15} strokeWidth={2} /></span>
                <div className="jv-confirm-main">
                  <div className="jv-body jv-confirm-title">{action.title}</div>
                  <div className="jv-caption jv-muted">{kindLabel(action.kind)} · {action.createdAt}</div>
                </div>
                <span className={"jv-caption jv-level-" + stateLevel(action.state)}>{stateLabel(action.state)}</span>
              </div>
              <div className="jv-caption jv-confirm-basis">
                <b>依据</b>
                {action.basis === "" ? "未获取" : action.basis}
              </div>
              <div className="jv-confirm-actions">
                <button type="button" className="jv-caption jv-confirm-plain" onClick={() => onSkip(action.id)}>
                  <X size={15} strokeWidth={2} />
                  跳过
                </button>
                <button
                  type="button"
                  className="jv-caption jv-confirm-primary"
                  disabled={executing}
                  onClick={() => onConfirm(action.id)}
                >
                  <Check size={15} strokeWidth={2} />
                  确认执行
                </button>
              </div>
            </article>
          ))}
        </>
      )}

      {settled.length > 0 && (
        <section className="jv-confirm-settled">
          <div className="jv-caption jv-muted">已处理</div>
          {settled.map((action) => (
            <div key={action.id} className="jv-confirm-settled-row">
              <span className={"jv-caption jv-level-" + stateLevel(action.state)}>{stateLabel(action.state)}</span>
              <span className="jv-body jv-confirm-settled-title">{action.title}</span>
              <span className="jv-caption jv-muted">{action.summary ?? "未获取"}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
