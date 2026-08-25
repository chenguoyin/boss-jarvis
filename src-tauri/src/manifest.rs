use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

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

pub fn load() -> Manifest {
    let manifest: Manifest = serde_json::from_str(MANIFEST_JSON).expect("skills/manifest.json 解析失败");
    assert_eq!(manifest.schema_version, 1, "skills/manifest.json schemaVersion 不支持");
    for (id, entry) in &manifest.skills {
        if entry.kind == SkillKind::Platform && entry.macos.is_none() && entry.windows.is_none() {
            panic!("平台 Skill {} 缺少 macos/windows 配置", id);
        }
    }
    manifest
}

impl Manifest {
    pub fn skills_root(&self) -> PathBuf {
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
