import SwiftUI

/// 助手面板容器：组装 AssistantChatModel 与视图，绑定到工作台状态。
    /// Skill 列表动态读取：每次面板打开时重新扫描 workbench.json 与内置任务，
    /// 新装技能无需重启 App 即可被助手执行。
struct AssistantChatPanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    var configuration: SystemConfiguration
    @StateObject private var model: AssistantChatModel

    init(viewModel: DashboardViewModel, configuration: SystemConfiguration) {
        self.viewModel = viewModel
        self.configuration = configuration
        let sections = appSections.map(\.title) + ["系统配置"]
        let skillsProvider = { (SkillFetchService().tasks.map(\.skill) + ["oa-todo"]) }
        _model = StateObject(wrappedValue: AssistantChatModel(
            configuration: configuration,
            sections: sections,
            skillsProvider: skillsProvider,
            contextProvider: { viewModel.assistantContextSnapshot },
            currentSectionProvider: { viewModel.selectedSection },
            onOpenSection: { viewModel.selectedSection = $0 },
            onRunSkill: { name, completion in viewModel.refreshSkill(name, completion: completion) },
            mailItemsProvider: { viewModel.companyMail?.items ?? [] },
            onOpenMailReply: { message, completion in
                viewModel.openMailReply(message, completion: completion)
            }
        ))
    }

    var body: some View {
        AssistantChatView(model: model)
            .environmentObject(configuration)
    }
}
