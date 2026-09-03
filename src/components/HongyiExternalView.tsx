import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  url: string;
  cookie?: string;
  xSid?: string;
  refererSign?: string;
}

export default function HongyiExternalView({ url, cookie, xSid, refererSign }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 调试信息
  console.log("[虹翼外链] 收到的 Props:", { url, cookie: cookie?.substring(0, 50) + "...", xSid, refererSign });

  // 构建带认证参数的 URL
  const getAuthUrl = () => {
    console.log("[虹翼外链] 原始 URL:", url);
    console.log("[虹翼外链] xSid:", xSid);
    
    if (!url) return "";
    
    try {
      const urlObj = new URL(url);
      
      // 添加 x-sid 到 URL 参数
      if (xSid) {
        urlObj.searchParams.set("x-sid", xSid);
      }
      
      const finalUrl = urlObj.toString();
      console.log("[虹翼外链] 最终 URL:", finalUrl);
      return finalUrl;
    } catch (e) {
      console.error("[虹翼外链] URL 解析错误:", e);
      return url;
    }
  };

  // 发送认证信息到 iframe
  const sendAuthToIframe = () => {
    if (!iframeRef.current?.contentWindow) return;
    
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          type: "SET_AUTH",
          data: {
            cookie,
            xSid,
            refererSign,
          }
        },
        "*"
      );
    } catch (e) {
      console.error("发送认证信息失败:", e);
    }
  };

  useEffect(() => {
    console.log("[虹翼外链] Props 变化:", { url, cookie, xSid, refererSign });
    const authUrl = getAuthUrl();
    setCurrentUrl(authUrl);
    setLoading(true);
    setError(null);
  }, [url, xSid]);

  const handleLoad = () => {
    console.log("[虹翼外链] iframe 加载完成");
    setLoading(false);
    sendAuthToIframe();
  };

  const handleError = () => {
    console.log("[虹翼外链] iframe 加载错误");
    setLoading(false);
    setError("页面加载失败，请检查网络连接或 URL 是否正确");
  };

  const refreshPage = () => {
    if (iframeRef.current) {
      setLoading(true);
      setError(null);
      iframeRef.current.src = currentUrl;
    }
  };

  console.log("[虹翼外链] 渲染状态:", { url, currentUrl, loading, error });

  if (!url || url.trim() === "") {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <AlertCircle size={40} strokeWidth={1.5} />
          <div className="jv-title">虹翼外链地址未配置</div>
          <div className="jv-body jv-muted">
            请在系统设置中配置虹翼外链 URL。
          </div>
          <div className="jv-body jv-muted" style={{ marginTop: 12 }}>
            收到的 URL 参数: {String(url)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card jv-hongyi-external-view">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">虹翼外链</div>
          <div className="jv-caption jv-muted">{currentUrl || url}</div>
        </div>
        <button
          type="button"
          className="jv-icon-plain"
          title="刷新页面"
          onClick={refreshPage}
          disabled={loading}
        >
          <RefreshCw size={16} strokeWidth={2} className={loading ? "jv-refresh-spin" : ""} />
        </button>
      </div>
      
      <div className="jv-hongyi-external-container">
        {loading && (
          <div className="jv-hongyi-external-loading">
            <Loader2 size={24} className="jv-spin" />
            <div className="jv-body">正在加载虹翼系统...</div>
            <div className="jv-caption jv-muted" style={{ marginTop: 8, wordBreak: 'break-all' }}>
              {currentUrl}
            </div>
            <div className="jv-caption jv-muted" style={{ marginTop: 8 }}>
              x-sid: {xSid || '无'}
            </div>
            <div className="jv-caption jv-muted" style={{ marginTop: 4 }}>
              cookie: {cookie ? cookie.substring(0, 30) + '...' : '无'}
            </div>
          </div>
        )}
        
        {error && (
          <div className="jv-hongyi-external-error">
            <AlertCircle size={40} strokeWidth={1.5} />
            <div className="jv-title">加载失败</div>
            <div className="jv-body jv-muted">{error}</div>
            <button
              type="button"
              className="jv-control jv-settings-save-button"
              onClick={refreshPage}
              style={{ marginTop: 12 }}
            >
              <RefreshCw size={15} strokeWidth={2} />
              重试
            </button>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src={currentUrl}
          className="jv-hongyi-external-iframe"
          onLoad={handleLoad}
          onError={handleError}
          title="虹翼系统"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      </div>
    </div>
  );
}
