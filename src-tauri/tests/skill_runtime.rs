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
