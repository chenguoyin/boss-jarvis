import SwiftUI

@main
struct BossJarvisApp: App {
    @StateObject private var configuration = SystemConfiguration()
    @StateObject private var viewModel = DashboardViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
                .environmentObject(configuration)
                .onAppear {
                    viewModel.configureAutoRefresh(
                        enabled: configuration.autoRefreshEnabled,
                        intervalMinutes: configuration.autoRefreshInterval
                    )
                }
                .frame(minWidth: 1180, minHeight: 760)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            SidebarCommands()
        }
    }
}
