use serde::Serialize;
use serde_json::{json, Value};

/// 公司大模型 OpenAI 兼容客户端。Base URL / Key / 模型名从 skill-env 读取，源码不落任何凭证。
pub struct CompanyLlmClient {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

pub struct LlmChatArgs {
    pub messages: Vec<Value>,
    pub tools: Vec<Value>,
}

#[derive(Serialize)]
pub struct LlmChatOutcome {
    pub ok: bool,
    pub error: String,
    pub message: Value,
}

impl LlmChatOutcome {
    fn error(message: String) -> Self {
        Self { ok: false, error: message, message: Value::Null }
    }
}

impl CompanyLlmClient {
    pub async fn chat(&self, args: LlmChatArgs) -> LlmChatOutcome {
        let base = self.base_url.trim();
        if base.is_empty() {
            return LlmChatOutcome::error("模型 Base URL 未配置，请在「系统配置 → 模型调用」里填写。".into());
        }
        let endpoint = if base.ends_with('/') {
            format!("{base}chat/completions")
        } else {
            format!("{base}/chat/completions")
        };
        let mut body = json!({
            "model": self.model,
            "messages": args.messages,
            "max_tokens": 2048,
        });
        if !args.tools.is_empty() {
            body["tools"] = json!(args.tools);
        }

        let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(90)).build() {
            Ok(client) => client,
            Err(_) => return LlmChatOutcome::error("无法创建模型请求客户端。".into()),
        };
        let response = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await;
        let response = match response {
            Ok(response) => response,
            Err(error) => return LlmChatOutcome::error(format!("模型服务请求失败：{error}")),
        };
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return LlmChatOutcome::error(format!(
                "模型服务返回 {}：{}",
                status.as_u16(),
                text.chars().take(160).collect::<String>()
            ));
        }
        let parsed: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => return LlmChatOutcome::error("模型响应格式无法解析。".into()),
        };
        let message = parsed.pointer("/choices/0/message").cloned().unwrap_or(Value::Null);
        if message.is_null() {
            return LlmChatOutcome::error("模型响应格式无法解析。".into());
        }
        LlmChatOutcome { ok: true, error: String::new(), message }
    }
}
