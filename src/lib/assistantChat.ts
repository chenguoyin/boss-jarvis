import type { SkillEnvelope } from "./contract";
import { formatDateTime, nowDateTimeText } from "./datetime";
import { llmChat, readSkillData, readSkillEnv } from "./skillBridge";
import { parseOATodo } from "./oaTodo";
import { parseCompanyMail } from "./mail";
import { parseNativeCalendar } from "./nativeCalendar";
import { parseDailyBriefing } from "./dailyBriefing";
import { parseSkillManager } from "./skillManager";
import { buildHongyiSnapshot } from "./hongyiBusiness";

export type AssistantRole = "user" | "assistant" | "tool";

export interface AssistantMessage {
  id: number;
  role: AssistantRole;
  text: string;
}

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface MailLike {
  id: number;
  subject: string;
  needsReply: boolean;
}

interface ToolOutcome {
  progress: string;
  result: string;
}

export interface AssistantRuntime {
  sections: string[];
  skills: string[];
  currentSection: string;
  onOpenSection: (section: string) => void;
  onRunSkill: (skill: string) => Promise<boolean>;
  onReplyMail: (mailId: number) => Promise<{ ok: boolean; summary: string } | null>;
}

const MAX_TOOL_ROUNDS = 4;
const SNAPSHOT_SKILLS = [
  "oa-todo",
  "company-mail",
  "native-calendar",
  "daily-briefing",
  "skill-manager",
  "hongyi-today-metrics",
  "hongyi-business-overview",
];

function nowText(): string {
  return nowDateTimeText();
}

function fullTime(iso: string): string {
  if (iso === "" || iso === "未获取") return "未获取";
  return formatDateTime(iso);
}

// 与 legacy assistantContextSnapshot 对齐：压缩工作台已加载数据为文字快照。
export async function buildAssistantContextSnapshot(): Promise<string> {
  const envelopes = new Map<string, SkillEnvelope | null>();
  await Promise.all(
    SNAPSHOT_SKILLS.map(async (id) => {
      envelopes.set(id, await readSkillData(id));
    }),
  );
  const lines: string[] = [];

  const oaTodo = parseOATodo(envelopes.get("oa-todo") ?? null);
  if (oaTodo) {
    lines.push(`OA 待办 ${oaTodo.total} 件（${fullTime(oaTodo.fetchedAt)}）：`);
    for (const item of oaTodo.items.slice(0, 8)) {
      const priority = item.analysis?.priorityLabel ?? "";
      lines.push("- " + item.title + (priority === "" ? "" : "（" + priority + "）"));
    }
  } else {
    lines.push("OA 待办：未获取");
  }

  const mail = parseCompanyMail(envelopes.get("company-mail") ?? null);
  if (mail) {
    lines.push(`邮件 ${mail.count} 封，其中需回复 ${mail.needsReplyCount} 封（${fullTime(mail.fetchedAt)}）：`);
    for (const message of mail.items.filter((item) => item.needsReply).slice(0, 5)) {
      lines.push(`- #${message.id} ${message.subject}，发件人 ${message.sender}`);
    }
  } else {
    lines.push("邮件：未获取");
  }

  const calendarEnvelope = envelopes.get("native-calendar") ?? null;
  const calendar = calendarEnvelope && calendarEnvelope.ok ? parseNativeCalendar(calendarEnvelope) : null;
  if (calendar) {
    lines.push(`今日日程 ${calendar.summaryEventCount} 项，提醒 ${calendar.summaryReminderCount} 条（${fullTime(calendar.fetchedAt)}）`);
    for (const event of calendar.events.slice(0, 5)) {
      lines.push(`- ${event.start} ${event.title}`);
    }
  } else {
    lines.push("日历提醒：未获取");
  }

  const hongyi = buildHongyiSnapshot(
    envelopes.get("hongyi-today-metrics") ?? null,
    envelopes.get("hongyi-business-overview") ?? null,
  );
  if (hongyi.todayMetrics) {
    const m = hongyi.todayMetrics;
    lines.push(`今日经营速览：项目立项 ${m.projectsCount} 个、客户申请 ${m.customerApplicationsCount} 个、收入确认 ${m.revenueConfirmationsCount} 笔，金额 ${m.totalRevenueAmountText ?? "未获取"}`);
  }
  if (hongyi.overview) {
    const o = hongyi.overview;
    const parts: string[] = [];
    if (o.monthRevenueText) parts.push("本月营收 " + o.monthRevenueText);
    if (o.yearRevenueText) parts.push("年度营收 " + o.yearRevenueText);
    if (o.yearProfitText) parts.push("年度利润 " + o.yearProfitText);
    if (o.receivableBalanceText) parts.push("应收余额 " + o.receivableBalanceText);
    if (parts.length > 0) lines.push("经营概况：" + parts.join("，"));
  }

  const briefingEnvelope = envelopes.get("daily-briefing") ?? null;
  const briefing = briefingEnvelope && briefingEnvelope.ok ? parseDailyBriefing(briefingEnvelope) : null;
  if (briefing) {
    lines.push(`今日晨报（${fullTime(briefing.generatedAt)}）：${briefing.headline}`);
    if (briefing.mustDoItems.length > 0) {
      lines.push("必须立即处理：");
      for (const item of briefing.mustDoItems.slice(0, 5)) lines.push("- " + item);
    }
  } else {
    lines.push("每日晨报：未获取");
  }

  const skillManagerEnvelope = envelopes.get("skill-manager") ?? null;
  if (skillManagerEnvelope && skillManagerEnvelope.ok) {
    const manager = parseSkillManager(skillManagerEnvelope);
    lines.push(`Skill 管理：共 ${manager.count} 个，启用 ${manager.enabledCount} 个（${manager.items.map((s) => s.name).join("、")}）`);
  }

  return lines.join("\n");
}

function toolDefinitions(runtime: AssistantRuntime): unknown[] {
  return [
    {
      type: "function",
      function: {
        name: "open_section",
        description: "把工作台跳转到指定页面。",
        parameters: {
          type: "object",
          properties: { section: { type: "string", enum: runtime.sections } },
          required: ["section"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_skill",
        description: "重新执行指定 Skill 的取数（可能耗时数十秒），刷新对应页面数据。",
        parameters: {
          type: "object",
          properties: { skill: { type: "string", enum: runtime.skills } },
          required: ["skill"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reply_mail",
        description: "为指定邮件生成回复草稿，并在邮件客户端打开回复窗口；只开窗不代发送，由老板在客户端点击发送。",
        parameters: {
          type: "object",
          properties: { mail_id: { type: "string", description: "数据快照邮件条目里 # 后的数字 ID" } },
          required: ["mail_id"],
        },
      },
    },
  ];
}

function toolCallsFrom(message: Record<string, unknown>): ToolCall[] {
  const raw = message["tool_calls"];
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  for (const value of raw) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const fn = record["function"];
    if (typeof fn !== "object" || fn === null) continue;
    const fnRecord = fn as Record<string, unknown>;
    if (typeof record["id"] !== "string") continue;
    if (typeof fnRecord["name"] !== "string") continue;
    calls.push({
      id: record["id"],
      function: { name: fnRecord["name"], arguments: typeof fnRecord["arguments"] === "string" ? fnRecord["arguments"] : "{}" },
    });
  }
  return calls;
}

async function executeToolCall(
  call: ToolCall,
  runtime: AssistantRuntime,
  mailItems: MailLike[],
): Promise<ToolOutcome> {
  const name = call.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  if (name === "open_section") {
    const section = typeof args.section === "string" ? args.section : "";
    if (!runtime.sections.includes(section)) {
      return {
        progress: "跳转失败：页面不存在",
        result: `页面「${section}」不存在。可用页面：${runtime.sections.join("、")}`,
      };
    }
    runtime.onOpenSection(section);
    return { progress: `已跳转到「${section}」`, result: `已跳转到「${section}」页面。` };
  }
  if (name === "run_skill") {
    const skill = typeof args.skill === "string" ? args.skill : "";
    if (!runtime.skills.includes(skill)) {
      return {
        progress: "执行失败：Skill 不存在",
        result: `Skill ${skill} 不存在。可执行：${runtime.skills.join("、")}`,
      };
    }
    const ok = await runtime.onRunSkill(skill);
    if (ok) {
      return { progress: `已刷新 ${skill}`, result: `Skill ${skill} 重新取数完成，对应页面数据已更新。` };
    }
    return {
      progress: `${skill} 刷新失败`,
      result: `Skill ${skill} 取数失败，请告诉老板稍后重试，或查看 ~/.boss-jarvis/logs/fetch.log。`,
    };
  }
  if (name === "reply_mail") {
    const rawId = typeof args.mail_id === "string" ? args.mail_id : String(args.mail_id ?? -1);
    const mailId = Number.parseInt(rawId, 10);
    const message = mailItems.find((item) => item.id === mailId);
    if (!message) {
      return {
        progress: "回复失败：邮件不在当前列表",
        result: `邮件 ID ${rawId} 不在当前邮件列表里；可先 run_skill company-mail 刷新，或让老板到邮件页查看。`,
      };
    }
    const outcome = await runtime.onReplyMail(mailId);
    if (outcome && outcome.ok) {
      return {
        progress: `已为「${message.subject}」打开回复窗口`,
        result: `已为邮件「${message.subject}」生成回复草稿并在邮件客户端打开回复窗口；请提醒老板核对内容后在客户端点击发送。`,
      };
    }
    const summary = outcome && !outcome.ok ? outcome.summary : "未找到邮件";
    return { progress: `回复「${message.subject}」失败`, result: "回复失败：" + summary };
  }
  return { progress: "未知工具", result: `未知工具 ${name}，无法执行。` };
}

function systemPrompt(runtime: AssistantRuntime, snapshot: string): string {
  return `你是「Boss Jarvis」工作台里的 Jarvis 助手，服务老板。当前时间：${nowText()}，老板正在「${runtime.currentSection}」页面。
下面是工作台已加载的最新数据快照，回答问题时以它为准：

${snapshot}

你可以调用的工具：
- open_section：把工作台跳转到指定页面。
- run_skill：重新执行指定 Skill 的取数，刷新对应页面数据。
- reply_mail：为指定邮件生成回复草稿并在邮件客户端打开回复窗口（不代发送）。
规则：
- 审批、启停或装卸 Skill 等写操作你不能直接执行；告诉老板到对应页面确认，需要时用 open_section 跳转。
- 老板要回复某封邮件时，用 reply_mail，邮件 ID 取数据快照里「#」后的数字；回复窗口打开后提醒老板在邮件客户端核对并点击发送。
- 数据缺失或老板明确要最新数据时，先调用 run_skill 刷新，再回答。
- 回答要简洁，用中文，先给结论和关键数字。`;
}

function finish(
  history: Record<string, unknown>[],
  emit: (message: AssistantMessage) => void,
  onBusyChange: (busy: boolean) => void,
  text: string,
): void {
  history.push({ role: "assistant", content: text });
  emit({ id: Date.now(), role: "assistant", text });
  onBusyChange(false);
}

export async function runAssistantTurn(options: {
  text: string;
  history: Record<string, unknown>[];
  runtime: AssistantRuntime;
  emit: (message: AssistantMessage) => void;
  onBusyChange: (busy: boolean) => void;
}): Promise<void> {
  const { text, history, runtime, emit, onBusyChange } = options;
  const question = text.trim();
  if (question === "") return;

  const config = await readSkillEnv();
  if ((config["COMPANY_LLM_API_KEY"] ?? "") === "") {
    emit({ id: Date.now(), role: "user", text: question });
    emit({
      id: Date.now() + 1,
      role: "assistant",
      text: "还没有配置模型 API Key。请先在「系统配置 → 模型调用」里填写公司模型设置。",
    });
    return;
  }

  const snapshot = await buildAssistantContextSnapshot();
  const mailEnvelope = await readSkillData("company-mail");
  const mailResult = parseCompanyMail(mailEnvelope);
  const mailItems: MailLike[] = mailResult?.items ?? [];

  while (history[0]?.["role"] === "system") history.shift();
  history.unshift({ role: "system", content: systemPrompt(runtime, snapshot) });
  history.push({ role: "user", content: question });

  emit({ id: Date.now(), role: "user", text: question });
  onBusyChange(true);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const outcome = await llmChat(history, toolDefinitions(runtime));
    if (!outcome.ok) {
      finish(history, emit, onBusyChange, "抱歉，这次没能完成：" + outcome.error);
      return;
    }
    const message = outcome.message as Record<string, unknown>;
    const toolCalls = toolCallsFrom(message);
    const content = typeof message["content"] === "string" ? message["content"].trim() : "";
    if (toolCalls.length === 0) {
      const finalText = content === "" ? "已完成，可以继续问我。" : content;
      history.push({ role: "assistant", content: finalText });
      emit({ id: Date.now(), role: "assistant", text: finalText });
      onBusyChange(false);
      return;
    }
    const assistantEntry: Record<string, unknown> = { role: "assistant", tool_calls: toolCalls };
    if (content !== "") assistantEntry["content"] = content;
    history.push(assistantEntry);
    for (const call of toolCalls) {
      const result = await executeToolCall(call, runtime, mailItems);
      emit({ id: Date.now(), role: "tool", text: result.progress });
      history.push({ role: "tool", tool_call_id: call.id, content: result.result });
    }
  }
  finish(history, emit, onBusyChange, "动作链已执行完成，请到对应页面查看结果。");
}
