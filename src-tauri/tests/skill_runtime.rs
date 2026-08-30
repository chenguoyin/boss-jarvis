#[test]
#[ignore = "依赖本机 ~/.codex/skills，按需手动验证"]
fn fetch_skill_manager_writes_contract_json() {
    let outcome = boss_jarvis_lib::fetch_skill_for_integration("skill-manager");
    assert!(outcome.ok, "取数失败: {}", outcome.error);

    let path = boss_jarvis_lib::data_dir_for_integration().join("skill-manager.json");
    let text = std::fs::read_to_string(&path).expect("数据文件应已落盘");
    let parsed: serde_json::Value = serde_json::from_str(&text).expect("输出应为 JSON");
    assert_eq!(parsed["skill"], "skill-manager");
    assert_eq!(parsed["ok"], true);
    assert_eq!(parsed["mode"], "read_only");
}

#[test]
#[ignore = "依赖本机 ~/.codex/skills 与已有契约数据，按需手动验证"]
fn fetch_boss_cockpit_aggregates_existing_contract_json() {
    // 驾驶舱聚合不应因单一上游缺失而整体失败；已有任一契约 JSON 即可产出。
    let data_dir = boss_jarvis_lib::data_dir_for_integration();
    let has_source = ["oa-todo", "changhong-mail", "oa-schedule", "spm-todo"]
        .iter()
        .any(|skill| data_dir.join(format!("{skill}.json")).is_file());
    if !has_source {
        return;
    }
    let outcome = boss_jarvis_lib::fetch_skill_for_integration("boss-cockpit");
    assert!(outcome.ok, "驾驶舱取数失败: {}", outcome.error);
    let path = data_dir.join("boss-cockpit.json");
    let text = std::fs::read_to_string(&path).expect("驾驶舱数据应已落盘");
    let parsed: serde_json::Value = serde_json::from_str(&text).expect("驾驶舱输出应为 JSON");
    assert_eq!(parsed["ok"], true, "驾驶舱应聚合成功: {}", parsed["unavailableSources"]);
    assert!(parsed["homepage"].is_object(), "驾驶舱应包含 homepage 聚合结果");
}

#[test]
#[ignore = "依赖本机 ~/.codex/skills，按需手动验证"]
fn fetch_skills_concurrent_keeps_order_and_isolates_failures() {
    let ids = vec![
        "skill-manager".to_string(),
        "__missing_skill__".to_string(),
    ];
    let outcomes = boss_jarvis_lib::fetch_skills_for_integration(&ids);
    assert_eq!(outcomes.len(), 2, "并发取数应保持传入顺序与数量");
    assert_eq!(outcomes[0].skill, "skill-manager");
    assert_eq!(outcomes[1].skill, "__missing_skill__");
    assert!(outcomes[0].ok, "skill-manager 应取数成功: {}", outcomes[0].error);
    assert!(!outcomes[1].ok, "未知 Skill 应失败而不是拖垮整批");
}

#[test]
#[ignore = "依赖本机 daily-briefing 巡检产物，按需手动验证"]
fn read_daily_briefing_report_returns_latest_cockpit() {
    let Some(text) = boss_jarvis_lib::read_daily_briefing_report_for_integration() else {
        return;
    };
    let parsed: serde_json::Value = serde_json::from_str(&text).expect("晨报产物应为 JSON");
    assert!(parsed["bossView"].is_object(), "晨报产物应包含 bossView 契约");
}

#[test]
#[ignore = "依赖本机 weekly-summary 存档，按需手动验证"]
fn weekly_summary_archive_commands_work() {
    let dates = boss_jarvis_lib::weekly_summary_dates_for_integration();
    let Some(latest) = dates.first() else {
        return;
    };
    let Some(text) = boss_jarvis_lib::read_weekly_summary_archive_for_integration(latest.clone()) else {
        panic!("最新周报存档应可读取: {latest}");
    };
    let parsed: serde_json::Value = serde_json::from_str(&text).expect("周报存档应为 JSON");
    assert_eq!(parsed["reportDate"], *latest);
}

#[test]
#[ignore = "依赖本机 ~/.codex/skills 与审计目录，按需手动验证"]
fn toggle_skill_failure_writes_audit_trail() {
    let date = chrono_like_date();
    let audit_path = std::env::var("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".codex/workbench-audit").join(&date).join("audit.jsonl"))
        .unwrap();
    let before = std::fs::read_to_string(&audit_path).unwrap_or_default().lines().count();

    let outcome = boss_jarvis_lib::toggle_skill_for_integration("__nonexistent_skill__", false);
    assert!(!outcome.ok, "不存在的 Skill 应执行失败");
    assert!(outcome.summary.contains("__nonexistent_skill__"), "失败摘要应包含目标 Skill: {}", outcome.summary);

    let after_text = std::fs::read_to_string(&audit_path).expect("审计文件应已写入");
    let after = after_text.lines().count();
    assert!(after > before, "toggle_skill 失败也应写入审计留痕");
    let last = after_text.lines().last().expect("应存在审计记录");
    let parsed: serde_json::Value = serde_json::from_str(last).expect("审计行应为 JSON");
    assert_eq!(parsed["skill"], "skill-manager");
    assert_eq!(parsed["status"], "failed");
    assert_eq!(parsed["target"]["title"], "__nonexistent_skill__");
}

fn chrono_like_date() -> String {
    let output = std::process::Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .expect("date 命令应可用");
    String::from_utf8(output.stdout).expect("date 输出应为 UTF-8").trim().to_string()
}
