import {
  lifecycleLevel,
  lifecycleTitle,
  type ManagedSkill,
  type SkillManagerResult,
} from "@/lib/skillManager";
import { FolderPlus, Power, Trash2 } from "lucide-react";

interface Props {
  result: SkillManagerResult | null;
  onToggle: (skill: ManagedSkill) => void;
  onInstall: () => void;
  onUninstall: (skill: ManagedSkill) => void;
  pendingSkillIds: ReadonlySet<string>;
}

export default function SkillManagerView({
  result,
  onToggle,
  onInstall,
  onUninstall,
  pendingSkillIds,
}: Props) {
  if (result === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <div className="jv-title">Skill 管理</div>
          <div className="jv-body jv-muted">
            未获取到数据。请先运行 skill-manager，把输出 JSON 写入数据目录后刷新。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">Skill 管理</div>
          <div className="jv-caption jv-muted">
            共 {result.count} 个 · 启用 {result.enabledCount} 个 · 采集 {result.fetchedAt}
          </div>
        </div>
        <span className="jv-pill jv-pill-attention jv-caption">安装、卸载需确认后执行</span>
      </div>
      <button type="button" className="jv-skill-install" onClick={onInstall}>
        <FolderPlus size={15} strokeWidth={2} />
        选择目录并安装
      </button>

      {result.items.length === 0 ? (
        <div className="jv-body jv-muted jv-empty">未注册任何 Skill</div>
      ) : (
        <div className="jv-skill-table">
          <div className="jv-skill-row jv-skill-row-head jv-caption jv-muted">
            <span className="jv-skill-col-index">#</span>
            <span>Skill</span>
            <span className="jv-skill-col-status">生命周期</span>
            <span className="jv-skill-col-status">运行状态</span>
            <span className="jv-skill-col-actions">操作</span>
          </div>
          {result.items.map((skill, index) => (
            <div key={skill.id} className="jv-skill-row jv-body jv-muted">
              <span className="jv-skill-col-index">{index + 1}</span>
              <span className="jv-skill-main">
                <span className="jv-body jv-skill-name">{skill.name}</span>
                <span className="jv-caption jv-muted">
                  {skill.description === "" ? "未获取" : skill.description}
                </span>
              </span>
              <span className={`jv-skill-col-status jv-level-${lifecycleLevel(skill.lifecycleStatus)}`}>
                {lifecycleTitle(skill.lifecycleStatus)}
              </span>
              <span className="jv-skill-col-status">
                {skill.runtimeStatus === "" ? "未获取" : skill.runtimeStatus}
              </span>
              <span className="jv-skill-col-actions">
                {pendingSkillIds.has(skill.id) ? (
                  <span className="jv-caption jv-muted">已入队</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="jv-caption jv-skill-toggle"
                      title={(skill.enabledOnDisk ? "停用：" : "启用：") + skill.name + "，进入确认中心后执行"}
                      onClick={() => onToggle(skill)}
                    >
                      <Power size={15} strokeWidth={2} />
                      {skill.enabledOnDisk ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      className="jv-caption jv-skill-uninstall"
                      title={"拟卸载：" + skill.name + "，进入确认中心，确认后代码归档不删除"}
                      onClick={() => onUninstall(skill)}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
