import Foundation
import Testing
@testable import BossJarvis

struct SkillDataStoreTests {
    private func makeStore() throws -> (SkillDataStore, URL) {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return (SkillDataStore(baseDirectory: directory), directory)
    }

    private func write(_ json: String, skill name: String, to directory: URL) throws {
        let url = directory.appendingPathComponent(name + ".json")
        try Data(json.utf8).write(to: url)
    }

    @Test
    func missingFileReturnsNil() throws {
        let (store, _) = try makeStore()
        #expect(store.load(skill: "oa-todo") == nil)
        #expect(store.loadOATodo() == nil)
    }

    @Test
    func parsesOATodoRows() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "skill": "oa-todo",
          "mode": "read_only",
          "sourceSystem": "OA",
          "fetchedAt": "2026-08-15T09:30:00+08:00",
          "total": "2",
          "count": 2,
          "items": [
            { "title": "绵阳股份云中心费控系统实施", "source": "虹翼数智", "creator": "高郡", "sender": "高郡", "time": "2026-08-13 13:48",
              "analysis": { "priority": "P2", "priorityLabel": "中", "riskLevel": "yellow", "riskPoints": ["金额需核验"], "suggestion": "核对金额", "detail": "费控系统实施" } },
            { "title": "关于税务管理的选型报告", "source": "融合办公平台", "creator": "秦杰", "sender": "", "time": "2026-08-13 13:20",
              "analysis": { "priority": "P3", "priorityLabel": "低", "riskLevel": "green", "riskPoints": ["无明显风险"], "suggestion": "可同意", "detail": "选型报告" } }
          ]
        }
        """
        try write(json, skill: "oa-todo", to: directory)

        let result = store.loadOATodo()
        #expect(result != nil)
        #expect(result?.total == 2)
        #expect(result?.count == 2)
        #expect(result?.hasCountMismatch == false)
        #expect(result?.items.count == 2)
        #expect(result?.items.first?.title == "绵阳股份云中心费控系统实施")
        #expect(result?.items.first?.source == "虹翼数智")
        #expect(result?.items.last?.displaySender == "秦杰")
        #expect(result?.items.first?.analysis?.priority == "P2")
        #expect(result?.items.first?.analysis?.riskPoints == ["金额需核验"])
        #expect(result?.fetchedAt != nil)
    }

    @Test
    func countMismatchIsFlagged() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "skill": "oa-todo",
          "total": "13",
          "count": 2,
          "items": [
            { "title": "标题A", "source": "融合办公平台", "creator": "张三", "sender": "张三", "time": "2026-08-15 09:00" },
            { "title": "标题B", "source": "融合办公平台", "creator": "李四", "sender": "李四", "time": "2026-08-15 09:10" }
          ]
        }
        """
        try write(json, skill: "oa-todo", to: directory)

        let result = store.loadOATodo()
        #expect(result?.hasCountMismatch == true)
    }

    @Test
    func failedEnvelopeReturnsNil() throws {
        let (store, directory) = try makeStore()
        try write("{\"ok\": false, \"skill\": \"oa-todo\"}", skill: "oa-todo", to: directory)
        #expect(store.loadOATodo() == nil)
    }

    @Test
    func fetchedAtFallsBackToAuditCollectedAt() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "mode": "read_only",
          "sourceSystem": "macOS Mail",
          "count": 0,
          "rows": [],
          "audit": { "collectedAt": "2026-08-15T08:14:57.275Z", "action": "fetch_unread_mail", "result": "success" }
        }
        """
        try write(json, skill: "oa-todo", to: directory)

        let envelope = store.load(skill: "oa-todo")
        #expect(envelope?.fetchedAt != nil)
    }

    @Test
    func parsesReminderItemsWithLevels() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "skill": "reminder-center",
          "sourceSystem": "统一提醒中心",
          "count": 2,
          "items": [
            { "title": "合同到期提醒", "source": "OA", "time": "2026-08-15 10:00", "level": "urgent", "basis": "逾期", "suggestedAction": "立即处理" },
            { "title": "例会", "source": "日历", "time": "2026-08-15 15:00", "level": "normal" }
          ],
          "unavailableSources": ["OA 原生提醒"]
        }
        """
        try write(json, skill: "reminder-center", to: directory)

        let envelope = store.load(skill: "reminder-center")
        #expect(envelope != nil)
        #expect(envelope?.items.count == 2)
        #expect(envelope?.items.first?.level == .urgent)
        #expect(envelope?.items.last?.level == .normal)
        #expect(envelope?.unavailableSources == ["OA 原生提醒"])
    }

    @Test
    func parsesReminderLevelsFromSkillValues() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "skill": "reminder-center",
          "count": 3,
          "items": [
            { "title": "A", "level": "red" },
            { "title": "B", "level": "yellow" },
            { "title": "C", "level": "green" }
          ]
        }
        """
        try write(json, skill: "reminder-center", to: directory)

        let envelope = store.load(skill: "reminder-center")
        #expect(envelope?.items.map(\.level) == [.urgent, .attention, .normal])
    }

    @Test
    func parsesHongyiBusinessSnapshot() throws {
        let (store, directory) = try makeStore()
        let metricsJson = """
        {
          "ok": true,
          "skill": "hongyi-today-metrics",
          "fetchedAt": "2026-08-15T06:00:00Z",
          "bossView": {
            "todayMetrics": {
              "projectsCount": 2,
              "customerApplicationsCount": 1,
              "revenueConfirmationsCount": 3,
              "totalRevenueAmount": 175000,
              "totalRevenueAmountText": "175000.00"
            },
            "dataQuality": { "failedSourceCount": 0, "issues": [] }
          }
        }
        """
        let overviewJson = """
        {
          "ok": true,
          "skill": "hongyi-business-overview",
          "bossView": {
            "overview": {
              "totalCount": 5,
              "homepageCount": 1,
              "revenueCount": 2,
              "collectionCount": 1,
              "marginCount": 0,
              "projectCount": 1,
              "customerCount": 1,
              "departmentDashboard": {}
            },
            "dataQuality": { "failedSourceCount": 0, "issues": [] }
          }
        }
        """
        try write(metricsJson, skill: "hongyi-today-metrics", to: directory)
        try write(overviewJson, skill: "hongyi-business-overview", to: directory)

        let snapshot = store.loadHongyiBusinessSnapshot()
        #expect(snapshot.statusValue == "已接入")
        #expect(snapshot.todayMetrics?.projectsCount == 2)
        #expect(snapshot.todayMetrics?.totalRevenueAmountText == "175000.00")
        #expect(snapshot.overview?.totalCount == 5)
        #expect(snapshot.overview?.homepageCount == 1)
        #expect(snapshot.riskLevel == .attention)
    }

    @Test
    func parsesDepartmentDashboardMetrics() throws {
        let (store, directory) = try makeStore()
        let overviewJson = #"""
        {
          "ok": true,
          "skill": "hongyi-business-overview",
          "bossView": {
            "overview": {
              "totalCount": 12,
              "homepageCount": 0,
              "revenueCount": 0,
              "collectionCount": 0,
              "marginCount": 0,
              "projectCount": 0,
              "customerCount": 0,
              "departmentDashboard": {
                "monthRevenueText": "135",
                "quarterRevenueText": "167",
                "yearRevenueText": "801",
                "monthProfitText": "38",
                "yearProfitText": "-42",
                "yearGrossMarginText": "204",
                "yearGrossMarginRateText": "25.5%",
                "receivableBalanceText": "564",
                "overdueReceivableText": "291"
              }
            },
            "dataQuality": { "failedSourceCount": 0, "issues": [] }
          }
        }
        """#
        try write(overviewJson, skill: "hongyi-business-overview", to: directory)

        let snapshot = store.loadHongyiBusinessSnapshot()
        let overview = try #require(snapshot.overview)
        #expect(overview.hasDepartmentDashboardData)
        #expect(overview.monthRevenueText == "135")
        #expect(overview.quarterRevenueText == "167")
        #expect(overview.yearRevenueText == "801")
        #expect(overview.monthProfitText == "38")
        #expect(overview.yearProfitText == "-42")
        #expect(overview.yearGrossMarginText == "204")
        #expect(overview.yearGrossMarginRateText == "25.5%")
        #expect(overview.receivableBalanceText == "564")
        #expect(overview.overdueReceivableText == "291")
    }

    @Test
    func prefersHongyiBossViewContract() throws {
        let (store, directory) = try makeStore()
        let metricsJson = """
        {
          "ok": true,
          "skill": "hongyi-today-metrics",
          "metrics": {
            "todayProjects": { "count": 1 },
            "todayCustomerApplications": { "count": 0 },
            "todayRevenueConfirmations": { "count": 0, "totalRevenueAmount": 0 }
          },
          "bossView": {
            "todayMetrics": {
              "projectsCount": 2,
              "customerApplicationsCount": 3,
              "revenueConfirmationsCount": 4,
              "totalRevenueAmount": 50000,
              "totalRevenueAmountText": "50000.00"
            },
            "dataQuality": { "failedSourceCount": 0, "issues": [] }
          }
        }
        """
        let overviewJson = """
        {
          "ok": true,
          "skill": "hongyi-business-overview",
          "summary": { "total": 1 },
          "items": [ { "title": "本月收入(万元)", "amount": 999, "raw": { "sourceName": "部门看板" } } ],
          "bossView": {
            "overview": {
              "totalCount": 54,
              "homepageCount": 1,
              "revenueCount": 3,
              "collectionCount": 2,
              "marginCount": 4,
              "projectCount": 0,
              "customerCount": 0,
              "departmentDashboard": {
                "monthRevenueText": "135",
                "yearProfitText": "-42",
                "yearGrossMarginRateText": "25.5%",
                "overdueReceivableText": "291"
              }
            },
            "dataQuality": { "failedSourceCount": 2, "issues": ["收入确认:未找到菜单"] }
          }
        }
        """
        try write(metricsJson, skill: "hongyi-today-metrics", to: directory)
        try write(overviewJson, skill: "hongyi-business-overview", to: directory)

        let snapshot = store.loadHongyiBusinessSnapshot()
        // bossView 优先于 metrics/summary/items 的旧口径。
        #expect(snapshot.todayMetrics?.projectsCount == 2)
        #expect(snapshot.todayMetrics?.customerApplicationsCount == 3)
        #expect(snapshot.todayMetrics?.revenueConfirmationsCount == 4)
        #expect(snapshot.todayMetrics?.totalRevenueAmountText == "50000.00")
        let overview = try #require(snapshot.overview)
        #expect(overview.totalCount == 54)
        #expect(overview.monthRevenueText == "135")
        #expect(overview.yearProfitText == "-42")
        #expect(overview.yearGrossMarginRateText == "25.5%")
        #expect(overview.overdueReceivableText == "291")
        #expect(overview.failedSourceCount == 2)
        #expect(overview.dataQualityIssues == ["收入确认:未找到菜单"])
    }

    @Test
    func missingHongyiDataShowsMissing() throws {
        let (store, _) = try makeStore()
        let snapshot = store.loadHongyiBusinessSnapshot()
        #expect(snapshot.statusValue == "未获取")
        #expect(snapshot.riskLevel == .missing)
    }

    @Test
    func failedHongyiSourcesDoNotShowAsConnected() throws {
        let (store, directory) = try makeStore()
        let metricsJson = """
        {
          "ok": true,
          "skill": "hongyi-today-metrics",
          "bossView": {
            "todayMetrics": {
              "projectsCount": 0,
              "customerApplicationsCount": 0,
              "revenueConfirmationsCount": 0,
              "totalRevenueAmount": 0,
              "totalRevenueAmountText": "0.00"
            },
            "dataQuality": { "failedSourceCount": 1, "issues": ["今日项目数:未找到菜单：项目管理"] }
          },
          "sourceResults": [
            { "name": "今日项目数", "status": "failed", "error": "未找到菜单：项目管理" }
          ]
        }
        """
        let overviewJson = """
        {
          "ok": true,
          "skill": "hongyi-business-overview",
          "bossView": {
            "overview": {
              "totalCount": 0,
              "homepageCount": 0,
              "revenueCount": 0,
              "collectionCount": 0,
              "marginCount": 0,
              "projectCount": 0,
              "customerCount": 0,
              "departmentDashboard": {}
            },
            "dataQuality": { "failedSourceCount": 1, "issues": ["收入确认:未找到菜单：收确认"] }
          }
        }
        """
        try write(metricsJson, skill: "hongyi-today-metrics", to: directory)
        try write(overviewJson, skill: "hongyi-business-overview", to: directory)

        let snapshot = store.loadHongyiBusinessSnapshot()
        #expect(snapshot.statusValue == "未获取")
        #expect(snapshot.riskLevel == .missing)
        #expect(snapshot.primaryNote == "虹翼取数失败")
        #expect(snapshot.detailDescription.contains("未找到菜单"))
    }

    @Test
    func invalidJSONReturnsNil() throws {
        let (store, directory) = try makeStore()
        try write("not json", skill: "oa-todo", to: directory)
        #expect(store.load(skill: "oa-todo") == nil)
    }

    @Test
    func parsesCompanyMailRows() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "mode": "read_only",
          "sourceSystem": "Apple Mail",
          "count": 2,
          "audit": { "collectedAt": "2026-08-15T08:14:57.275Z", "action": "fetch_unread_mail", "result": "success" },
          "rows": [
            {
              "id": 101,
              "sender": "张三 <zhangsan@changhong.com>",
              "subject": "请于周五前反馈预算口径",
              "receivedAt": "2026-08-15T09:12:00+08:00",
              "bodySummary": "请确认预算口径",
              "bodyHtml": "<p>请确认预算口径</p>",
              "analysis": { "urgency": "yellow", "needsReply": true, "replyBasis": "明确要求周五前反馈" }
            },
            {
              "id": 102,
              "sender": "系统通知",
              "subject": "服务器例行维护通知",
              "receivedAt": "2026-08-14T18:00:00+08:00",
              "analysis": { "urgency": "green", "needsReply": false }
            }
          ]
        }
        """
        try write(json, skill: "company-mail", to: directory)

        let result = store.loadCompanyMail()
        #expect(result != nil)
        #expect(result?.count == 2)
        #expect(result?.items.count == 2)
        #expect(result?.needsReplyCount == 1)
        #expect(result?.hasAttention == true)
        #expect(result?.hasUrgent == false)
        #expect(result?.needsReplyItems.first?.replyBasis == "明确要求周五前反馈")
        #expect(result?.needsReplyItems.first?.bodyHtml == "<p>请确认预算口径</p>")
        #expect(result?.items[1].urgency == .normal)
        #expect(result?.fetchedAt != nil)
    }

    @Test
    func companyMailMissingOrNotOkReturnsNil() throws {
        let (store, directory) = try makeStore()
        #expect(store.loadCompanyMail() == nil)
        try write("{\"ok\": false}", skill: "company-mail", to: directory)
        #expect(store.loadCompanyMail() == nil)
    }

    @Test
    func parsesSkillManagerItems() throws {
        let (store, directory) = try makeStore()
        let json = """
        {
          "ok": true,
          "sourceSystem": "skill-manager",
          "action": "list",
          "count": 2,
          "items": [
            {
              "id": "oa-todo",
              "name": "OA 待办",
              "description": "获取 OA 待办",
              "lifecycleStatus": "enabled",
              "runtime": { "status": "idle", "updatedAt": "2026-08-15T09:00:00+08:00", "message": "" },
              "enabledOnDisk": true
            },
            {
              "id": "daily-briefing",
              "name": "自动晨报",
              "description": "",
              "lifecycleStatus": "disabled",
              "runtime": { "status": "idle" },
              "enabledOnDisk": false
            }
          ]
        }
        """
        try write(json, skill: "skill-manager", to: directory)

        let result = store.loadSkillManager()
        #expect(result != nil)
        #expect(result?.count == 2)
        #expect(result?.enabledCount == 1)
        #expect(result?.items.first?.isEnabled == true)
        #expect(result?.items.first?.lifecycleTitle == "启用")
        #expect(result?.items.last?.lifecycleTitle == "停用")
    }

    @Test
    func skillManagerMissingReturnsNil() throws {
        let (store, _) = try makeStore()
        #expect(store.loadSkillManager() == nil)
    }
}
