use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

/// skills/manifest.json 是 skill → 平台 → 脚本 + runner 的唯一入口，
/// include_str! 内嵌进壳层，改清单双端生效。
pub const MANIFEST_JSON: &str = include_str!("../../skills/manifest.json");

#[derive(Debug, Deserialize)]
pub struct Manifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u8,
    #[serde(rename = "skillsRoot")]
    pub skills_root: String,
    pub skills: HashMap<String, SkillEntry>,
}

#[derive(Debug, Deserialize)]
pub struct SkillEntry {
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub kind: SkillKind,
    #[serde(default)]
    pub runner: Option<String>,
    #[serde(default)]
    pub fetch: Option<String>,
    #[serde(default)]
    pub fetch_args: Vec<String>,
    #[serde(default)]
    pub actions: HashMap<String, String>,
    #[serde(default)]
    pub macos: Option<PlatformSpec>,
    #[serde(default)]
    pub windows: Option<PlatformSpec>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformSpec {
    pub runner: Option<String>,
    pub fetch: Option<String>,
    #[serde(default)]
    pub fetch_args: Vec<String>,
    #[serde(default)]
    pub actions: HashMap<String, String>,
    #[serde(default)]
    pub pending: bool,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillKind {
    Common,
    Platform,
}

/// 当前平台解析结果：要么可执行，要么明确 pending（Phase T 的 Windows 邮件/日历）。
#[derive(Debug)]
pub struct ResolvedSkill {
    pub runner: String,
    pub script: String,
    pub args: Vec<String>,
}

#[derive(Debug)]
pub struct UnavailableSkill {
    pub note: String,
}

#[derive(Debug)]
pub enum PlatformResolution {
    Available(ResolvedSkill),
    Unavailable(UnavailableSkill),
}

pub struct SkillFetchTask {
    pub id: String,
}

static MANIFEST_CACHE: OnceLock<Manifest> = OnceLock::new();

/// 清单由 include_str! 内嵌，进程内不可变；缓存解析与校验结果，避免每次刷新重复执行。
pub fn load_cached() -> &'static Manifest {
    MANIFEST_CACHE.get_or_init(load)
}

pub struct ResolvedAction {
    pub runner: String,
    pub script: String,
}

pub fn load() -> Manifest {
    let manifest: Manifest = serde_json::from_str(MANIFEST_JSON).expect("skills/manifest.json 解析失败");
    assert_eq!(manifest.schema_version, 1, "skills/manifest.json schemaVersion 不支持");
    for (id, entry) in &manifest.skills {
        if entry.kind == SkillKind::Platform && entry.macos.is_none() && entry.windows.is_none() {
            panic!("平台 Skill {} 缺少 macos/windows 配置", id);
        }
    }
    validate_scripts_exist(&manifest);
    manifest
}

/// 清单声明的脚本必须真实存在；缺失立即失败，避免取数/写操作静默变成"未找到执行脚本"。
/// 只验证当前平台 + common 的脚本，跨平台编译时不检查对端脚本。
fn validate_scripts_exist(manifest: &Manifest) {
    let root = manifest.skills_root();
    let mut missing: Vec<String> = Vec::new();
    for (id, entry) in &manifest.skills {
        if entry.kind == SkillKind::Common {
            if let Some(fetch) = entry.fetch.as_ref().filter(|s| !s.is_empty()) {
                if !root.join(fetch).is_file() {
                    missing.push(format!("{} fetch {}", id, fetch));
                }
            }
            for (action, script) in &entry.actions {
                if !root.join(script).is_file() {
                    missing.push(format!("{} action {} {}", id, action, script));
                }
            }
        } else if let Some(spec) = platform_spec(entry) {
            if let Some(fetch) = spec.fetch.as_ref().filter(|s| !s.is_empty()) {
                if !root.join(fetch).is_file() {
                    missing.push(format!("{} {} fetch {}", id, current_platform_label(), fetch));
                }
            }
            for (action, script) in &spec.actions {
                if !root.join(script).is_file() {
                    missing.push(format!("{} {} action {} {}", id, current_platform_label(), action, script));
                }
            }
        }
    }
    if !missing.is_empty() {
        panic!("skills/manifest.json 声明的脚本缺失: {}", missing.join("; "));
    }
}

#[cfg(target_os = "windows")]
fn current_platform_label() -> &'static str { "windows" }
#[cfg(not(target_os = "windows"))]
fn current_platform_label() -> &'static str { "macos" }

impl Manifest {
    /// 解析 skills 根目录：环境变量 > exe 同级 skills/ > manifest 声明的 skillsRoot。
    /// 便携包把 skills 放在 exe 旁边，无需用户配置。
    pub fn skills_root(&self) -> PathBuf {
        if let Ok(dir) = std::env::var("BOSS_JARVIS_SKILLS_ROOT") {
            if !dir.is_empty() {
                return PathBuf::from(dir);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let sibling = parent.join("skills");
                if sibling.is_dir() {
                    return sibling;
                }
            }
        }
        crate::paths::expand_tilde(&self.skills_root)
    }

    pub fn resolve(&self, id: &str) -> Option<(String, String, PlatformResolution)> {
        let entry = self.skills.get(id)?;
        Some((
            id.to_string(),
            entry.display_name.clone(),
            resolve_for_current_os(entry)?,
        ))
    }

    /// 当前平台可执行的全部取数任务，按 id 排序保证顺序稳定。
    pub fn fetch_tasks(&self) -> Vec<SkillFetchTask> {
        let mut tasks = Vec::new();
        for (id, entry) in &self.skills {
            if let Some(PlatformResolution::Available(resolved)) = resolve_for_current_os(entry) {
                if resolved.script.is_empty() {
                    continue;
                }
                tasks.push(SkillFetchTask {
                    id: id.clone(),
                });
            }
        }
        tasks.sort_by(|a, b| a.id.cmp(&b.id));
        tasks
    }

    pub fn fetch_task_ids(&self) -> Vec<String> {
        self.fetch_tasks().into_iter().map(|task| task.id).collect()
    }

    /// 解析当前平台的动作脚本；确认中心和直达操作共用同一入口。
    pub fn resolve_action(&self, id: &str, action: &str) -> Option<ResolvedAction> {
        let entry = self.skills.get(id)?;
        let script;
        if entry.kind == SkillKind::Common {
            script = entry.actions.get(action)?.clone();
        } else {
            let spec = platform_spec(entry)?;
            script = spec.actions.get(action)?.clone();
        }
        if script.is_empty() {
            return None;
        }
        let runner = runner_for_script(&script);
        Some(ResolvedAction { runner, script })
    }
}

/// 同一平台里可能混用 node 与 powershell 脚本，按扩展名定 runner 更可靠。
fn runner_for_script(script: &str) -> String {
    if script.ends_with(".ps1") {
        "powershell".to_string()
    } else {
        "node".to_string()
    }
}

fn platform_spec(entry: &SkillEntry) -> Option<&PlatformSpec> {
    if entry.kind == SkillKind::Common {
        return None;
    }
    #[cfg(target_os = "windows")]
    let spec = entry.windows.as_ref();
    #[cfg(not(target_os = "windows"))]
    let spec = entry.macos.as_ref();
    spec
}

fn resolve_for_current_os(entry: &SkillEntry) -> Option<PlatformResolution> {
    if entry.kind == SkillKind::Common {
        return Some(PlatformResolution::Available(ResolvedSkill {
            runner: entry.runner.clone()?,
            script: entry.fetch.clone()?,
            args: entry.fetch_args.clone(),
        }));
    }

    #[cfg(target_os = "windows")]
    let spec = entry.windows.as_ref();
    #[cfg(not(target_os = "windows"))]
    let spec = entry.macos.as_ref();

    let spec = spec?;
    if spec.pending {
        return Some(PlatformResolution::Unavailable(UnavailableSkill {
            note: spec
                .note
                .clone()
                .unwrap_or_else(|| "该平台实现待 Phase T 接入".to_string()),
        }));
    }
    match (spec.runner.clone(), spec.fetch.clone()) {
        (Some(runner), Some(script)) if !script.is_empty() => {
            Some(PlatformResolution::Available(ResolvedSkill {
                runner,
                script,
                args: spec.fetch_args.clone(),
            }))
        }
        _ => Some(PlatformResolution::Unavailable(UnavailableSkill {
            note: spec
                .note
                .clone()
                .unwrap_or_else(|| "该平台实现待 Phase T 接入".to_string()),
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::{Manifest, SkillKind, MANIFEST_JSON};

    #[test]
    fn mail_uses_one_common_skill_on_every_platform() {
        let manifest: Manifest = serde_json::from_str(MANIFEST_JSON).expect("manifest should parse");
        let mail = manifest
            .skills
            .get("changhong-mail")
            .expect("changhong-mail should be declared");

        assert_eq!(mail.kind, SkillKind::Common);
        assert_eq!(mail.fetch.as_deref(), Some("changhong-mail/fetch-unread-mail.cjs"));
        assert!(manifest.skills.get("windows-outlook-mail").is_none());
        assert!(manifest.skills.get("company-mail").is_none());
    }
}
