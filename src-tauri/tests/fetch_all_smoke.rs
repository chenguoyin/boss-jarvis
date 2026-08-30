#[test]
#[ignore = "上线复盘用：真实执行全部通用取数 Skill"]
fn fetch_all_common_skills_real() {
    let skills = [
        "oa-todo",
        "spm-todo",
        "hongyi-today-metrics",
        "hongyi-business-overview",
        "reminder-center",
        "daily-briefing",
        "skill-manager",
        "weekly-summary",
        "changhong-mail",
    ];
    let ids: Vec<String> = skills.iter().map(|s| s.to_string()).collect();
    let outcomes = boss_jarvis_lib::fetch_skills_for_integration(&ids);
    assert_eq!(outcomes.len(), skills.len());
    for outcome in &outcomes {
        assert!(outcome.ok, "{} 取数失败: {}", outcome.skill, outcome.error);
        let path = boss_jarvis_lib::data_dir_for_integration().join(format!("{}.json", outcome.skill));
        let text = std::fs::read_to_string(&path).expect("数据文件应已落盘");
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("输出应为 JSON");
        assert_eq!(parsed["ok"], true, "{} 应产出 ok=true", outcome.skill);
        println!("{} ok fetched", outcome.skill);
    }
}
