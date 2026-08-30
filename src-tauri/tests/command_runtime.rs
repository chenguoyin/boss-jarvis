//! 写命令日志端到端验证：真实执行一次必然失败的写命令，
//! 断言 ~/.boss-jarvis/logs/actions.log 落盘了可解析的 JSON 明细。

#[test]
#[ignore = "依赖本机 ~/.codex/skills 与 ~/.boss-jarvis/logs，按需手动验证"]
fn failed_action_appends_actions_log_with_full_detail() {
    let log_path = std::env::var("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".boss-jarvis/logs/actions.log"))
        .expect("HOME 应可用");
    let before = std::fs::read_to_string(&log_path).unwrap_or_default().lines().count();

    // 不存在的 Skill：走 run_skill_action → log_action 全链路并失败。
    let outcome = boss_jarvis_lib::toggle_skill_for_integration("__nonexistent_skill__", false);
    assert!(!outcome.ok, "不存在的 Skill 应执行失败");

    let after_text = std::fs::read_to_string(&log_path).expect("actions.log 应已落盘");
    assert!(after_text.lines().count() > before, "失败写命令必须追加 actions.log");
    let entry: serde_json::Value = after_text
        .lines()
        .last()
        .map(|line| serde_json::from_str(line).expect("actions.log 每行必须是 JSON"))
        .expect("日志不应为空");
    assert_eq!(entry["skill"], "skill-manager");
    assert_eq!(entry["action"], "manage");
    assert_eq!(entry["ok"], false);
    assert!(entry["stderr"].is_string() && entry["stdout"].is_string(), "stdout/stderr 明细必须落盘");
    assert!(entry["time"].is_string() && entry["durationMs"].is_number());
    assert!(entry["error"].as_str().map_or(false, |e| e.contains("__nonexistent_skill__")),
        "error 字段应带可定位的原因: {}", entry["error"]);
}
