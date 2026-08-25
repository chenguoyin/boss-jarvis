import {
  lifecycleLevel,
  lifecycleTitle,
  type SkillManagerResult,
} from "@/lib/skillManager";

interface Props {
  result: SkillManagerResult | null;
}

export default function SkillManagerView({ result }: Props) {
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

      {result.items.length === 0 ? (
        <div className="jv-body jv-muted jv-empty">未注册任何 Skill</div>
      ) : (
        <div className="jv-skill-table">
          <div className="jv-skill-row jv-skill-row-head jv-caption jv-muted">
            <span className="jv-skill-col-index">#</span>
            <span>Skill</span>
            <span className="jv-skill-col-status">生命周期</span>
            <span className="jv-skill-col-status">运行状态</span>
            <span className="jv-skill-col-actions" />
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
              <span className="jv-skill-col-actions" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
