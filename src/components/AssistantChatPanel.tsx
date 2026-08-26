import { useEffect, useRef, useState } from "react";
import { Eraser, Search, SendHorizonal, Sparkles, X, Zap } from "lucide-react";
import { runAssistantTurn, type AssistantMessage, type AssistantRuntime } from "@/lib/assistantChat";

interface Props {
  runtime: AssistantRuntime;
  onClose: () => void;
}

const SUGGESTIONS = [
  "今天有几封邮件要回复？",
  "刷新 OA 待办并总结",
  "今天经营情况怎么样？",
  "我今天有什么日程？",
];

export default function AssistantChatPanel({ runtime, onClose }: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isBusy, setBusy] = useState(false);
  const historyRef = useRef<Record<string, unknown>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 同步锁：state 更新是异步的，防同一事件循环内连点/双触发造成重复提交。
  const sendingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const last = listRef.current?.lastElementChild;
    last?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = (text: string) => {
    const question = text.trim();
    if (question === "" || isBusy || sendingRef.current) return;
    sendingRef.current = true;
    setDraft("");
    setBusy(true);
    void runAssistantTurn({
      text: question,
      history: historyRef.current,
      runtime,
      emit: (message) => setMessages((current) => [...current, message]),
      onBusyChange: setBusy,
    })
      .catch(() => {
        setMessages((current) => [
          ...current,
          { id: Date.now(), role: "assistant", text: "抱歉，这次没能完成：本地调用链异常。" },
        ]);
        setBusy(false);
      })
      .finally(() => {
        sendingRef.current = false;
      });
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
            <button
              type="button"
              className="jv-icon-plain"
              title="清空对话"
              onClick={() => {
                setMessages([]);
                historyRef.current = [];
              }}
            >
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
            <>
              {messages.map((message) =>
                message.role === "tool" ? (
                  <div key={message.id} className="jv-assistant-tool">
                    <Zap size={13} strokeWidth={2} />
                    <span className="jv-caption">{message.text}</span>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className={
                      "jv-assistant-message " +
                      (message.role === "user" ? "jv-assistant-message-user" : "jv-assistant-message-bot")
                    }
                  >
                    <span className="jv-body">{message.text}</span>
                  </div>
                ),
              )}
              {isBusy && (
                <div className="jv-assistant-busy">
                  <span className="jv-assistant-spinner" aria-hidden="true" />
                  <span className="jv-caption jv-muted">正在思考或获取数据…</span>
                </div>
              )}
            </>
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
            disabled={isBusy}
          />
          <button
            type="submit"
            className="jv-icon-plain jv-assistant-send"
            title="发送（回车）"
            disabled={isBusy || draft.trim() === ""}
          >
            <SendHorizonal size={22} strokeWidth={1.8} />
          </button>
        </form>
      </section>
    </div>
  );
}
