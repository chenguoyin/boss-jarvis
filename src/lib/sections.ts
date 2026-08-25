import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Calendar,
  CalendarClock,
  ChartLine,
  CircleCheck,
  CreditCard,
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
}

// 侧栏分区：单一事实来源，对应 legacy/ContentView.swift 的 appSections。
export const appSections: AppSection[] = [
  { id: "dashboard", title: "驾驶舱", icon: LayoutGrid },
  { id: "briefing", title: "每日晨报", icon: Sunrise },
  { id: "oa-todo", title: "OA 待办", icon: ListChecks },
  { id: "business", title: "经营情况", icon: ChartLine },
  { id: "funds", title: "资金费用", icon: CreditCard },
  { id: "mail", title: "邮件", icon: Mail },
  { id: "calendar", title: "日历提醒", icon: Calendar },
  { id: "weekly", title: "每周总结", icon: CalendarClock },
  { id: "skills", title: "Skill 管理", icon: Briefcase },
  { id: "audit", title: "审计日志", icon: Shield },
];

// 非侧栏分区：系统配置（顶栏齿轮）、确认中心（驾驶舱入口进入）。
export const settingsSection: AppSection = {
  id: "settings",
  title: "系统配置",
  icon: Settings,
};

export const confirmationSection: AppSection = {
  id: "confirmation",
  title: "确认中心",
  icon: CircleCheck,
};

export function sectionById(id: string): AppSection | undefined {
  if (id === settingsSection.id) return settingsSection;
  if (id === confirmationSection.id) return confirmationSection;
  return appSections.find((s) => s.id === id);
}
