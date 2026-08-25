import Foundation
import Testing
@testable import BossJarvis

struct NativeCalendarTests {
    @Test
    func parsesNativeCalendarEvents() throws {
        let json: [String: Any] = [
            "ok": true,
            "skill": "native-calendar",
            "date": "2026-08-15",
            "events": [
                [
                    "id": "EVT-1",
                    "title": "dept birthday",
                    "calendar": "dept",
                    "start": "2026-08-15T09:00:00+08:00",
                    "end": "2026-08-15T10:00:00+08:00",
                    "isAllDay": false,
                    "priority": "green",
                    "reasons": ["low priority"]
                ]
            ],
            "reminders": [],
            "summary": [
                "eventCount": 1,
                "reminderCount": 0,
                "homepageItems": 0,
                "overdueReminderCount": 0
            ],
            "fetchedAt": "2026-08-15T14:59:52.000Z"
        ]
        let envelope = SkillDataStore.parse(json)
        let result = SkillDataStore.parseNativeCalendar(envelope)
        #expect(result.events.count == 1)
        #expect(result.events[0].title == "dept birthday")
        #expect(result.events[0].priorityLevel == .normal)
        #expect(result.summaryEventCount == 1)
        #expect(result.summaryHomepageItems == 0)
        #expect(!result.hasHomepageItems)
    }

    @Test
    func parsesNativeCalendarEmptyAsNil() throws {
        // ok=false 时整体视为未获取
        let json: [String: Any] = ["ok": false, "skill": "native-calendar"]
        let envelope = SkillDataStore.parse(json)
        #expect(!envelope.ok)
    }
}
