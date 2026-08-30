import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Calendar,
  CalendarClock,
  ChartLine,
  CircleCheck,
  LayoutGrid,
  ListChecks,
  Mail,
  Settings,
  Shield,
  Sunrise,
} from "lucide-react";

export interface AppSection {
  id: string;
  title: string;
  icon: LucideIcon;
  skills: string[];
}

// 侧栏分区：单一事实来源，对应 legacy/ContentView.swift 的 appSections。
export const appSections: AppSection[] = [
  {
    id: "dashboard",
    title: "驾驶舱",
    icon: LayoutGrid,
    skills: [
      "oa-todo",
      "reminder-center",
      "changhong-mail",
      "oa-schedule",
      "skill-manager",
      "daily-briefing",
      "boss-cockpit",
      "hongyi-today-metrics",
      "hongyi-business-overview",
    ],
  },
  { id: "briefing", title: "每日晨报", icon: Sunrise, skills: ["daily-briefing"] },
  { id: "oa-todo", title: "OA 待办", icon: ListChecks, skills: ["oa-todo"] },
  {
    id: "business",
    title: "经营情况",
    icon: ChartLine,
    skills: ["hongyi-today-metrics", "hongyi-business-overview"],
  },
  // 资金费用（funds）后期再实现，暂从侧栏隐藏；恢复时补回 CreditCard 图标并取消下行注释。
  // { id: "funds", title: "资金费用", icon: CreditCard, skills: ["oa-todo"] },
  { id: "mail", title: "邮件", icon: Mail, skills: ["changhong-mail"] },
  { id: "calendar", title: "日程提醒", icon: Calendar, skills: ["oa-schedule"] },
  { id: "weekly", title: "每周总结", icon: CalendarClock, skills: ["weekly-summary"] },
  { id: "skills", title: "Skill 管理", icon: Briefcase, skills: ["skill-manager"] },
  { id: "audit", title: "审计日志", icon: Shield, skills: [] },
];

// 非侧栏分区：系统配置（顶栏齿轮）、确认中心（驾驶舱入口进入）。
export const settingsSection: AppSection = {
  id: "settings",
  title: "系统配置",
  icon: Settings,
  skills: [],
};

export const confirmationSection: AppSection = {
  id: "confirmation",
  title: "确认中心",
  icon: CircleCheck,
  skills: [],
};

export function sectionById(id: string): AppSection | undefined {
  if (id === settingsSection.id) return settingsSection;
  if (id === confirmationSection.id) return confirmationSection;
  return appSections.find((s) => s.id === id);
}
