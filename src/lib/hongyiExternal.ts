import { readSkillData } from "./skillBridge";
import { getHongyiExternalUrl, getHongyiCookie, getHongyiXSid } from "./config";

export interface HongyiExternalConfig {
  url: string;
  title: string;
  description: string;
  defaultUrl: string;
  isConfigured: boolean;
  xSid?: string;
  cookie?: string;
  refererSign?: string;
}

export async function getHongyiExternalConfig(): Promise<HongyiExternalConfig> {
  // 先获取 URL
  const url = getHongyiExternalUrl() || "https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard";
  
  // 尝试从 Skill 数据获取认证信息
  let xSid: string | undefined;
  let cookie: string | undefined;
  let refererSign: string | undefined;
  
  try {
    const data = await readSkillData("hongyi-external");
    if (data?.output) {
      const output = data.output as Record<string, unknown>;
      xSid = output.xSid as string | undefined;
      cookie = output.cookie as string | undefined;
      refererSign = output.refererSign as string | undefined;
    }
  } catch (e) {
    console.log("[虹翼外链] 获取 Skill 数据失败，尝试使用手动配置");
  }
  
  // 如果 Skill 没有数据，回退到手动配置
  if (!xSid) {
    xSid = getHongyiXSid() || undefined;
  }
  if (!cookie) {
    cookie = getHongyiCookie() || undefined;
  }
  
  return {
    url,
    title: "虹翼外链",
    description: "打开虹翼系统经营数据看板",
    defaultUrl: "https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard",
    isConfigured: !!(xSid || cookie),
    xSid,
    cookie,
    refererSign,
  };
}
