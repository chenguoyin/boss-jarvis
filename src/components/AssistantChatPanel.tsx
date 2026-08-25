import { useEffect, useRef, useState } from "react";
import { ArrowUp, Eraser, Search, Sparkles, X } from "lucide-react";

interface Props {
  onClose: () => void;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "今天有几封邮件要回复？",
  "刷新 OA 待办并总结",
  "今天经营情况怎么样？",
  "我今天有什么日程？",
];

export default function AssistantChatPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const last = listRef.current?.lastElementChild;
    last?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = (text: string) => {
    const question = text.trim();
    if (question === "") return;
    const id = Date.now();
    setMessages((current) => [
      ...current,
      { id, role: "user", text: question },
      {
        id: id + 1,
        role: "assistant",
        text: "助手模型调用链还未接入 Tauri 壳：请先在「系统配置 → 模型调用」确认配置，接入后可从这里执行取数、页面跳转和回复草稿。",
      },
    ]);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="jv-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Jarvis 助手">
      <section className="jv-assistant">
        <header className="jv-assistant-header">
          <Sparkles size={14} strokeWidth={2} className="jv-assistant-mark" />
          <span className="jv-title jv-assistant-title">Jarvis 助手</span>
          <span className="jv-caption jv-faint">可执行 Skill 取数与页面跳转 · Esc 关闭</span>
          <span className="jv-assistant-actions">
            <button type="button" className="jv-icon-plain" title="清空对话" onClick={() => setMessages([])}>
              <Eraser size={13} strokeWidth={2} />
            </button>
            <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
              <X size={13} strokeWidth={2} />
            </button>
          </span>
        </header>
        <div className="jv-assistant-messages" ref={listRef}>
          {messages.length === 0 ? (
            <div className="jv-assistant-empty">
              <Search size={30} strokeWidth={1.5} className="jv-faint" />
              <div className="jv-body jv-muted">问事项、客户、合同，或直接执行 Skill</div>
              <div className="jv-assistant-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    className="jv-assistant-suggestion"
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  "jv-assistant-message " +
                  (message.role === "user" ? "jv-assistant-message-user" : "jv-assistant-message-bot")
                }
              >
                <span className="jv-body">{message.text}</span>
              </div>
            ))
          )}
        </div>
        <form
          className="jv-assistant-input"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            ref={inputRef}
            className="jv-assistant-input-field"
            value={draft}
            placeholder="问 Jarvis，回车发送"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="jv-icon-plain jv-assistant-send"
            title="发送（回车）"
            disabled={draft.trim() === ""}
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </form>
      </section>
    </div>
  );
}
