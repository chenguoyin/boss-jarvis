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
