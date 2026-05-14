import crypto from 'crypto';
import type { ChannelSender, SendMessage, SendResult } from './types';

/**
 * 솔라피(Solapi / 구 NHN Cloud Outbound) 어댑터.
 * API: https://docs.solapi.com
 *
 * 필요 env:
 *   SOLAPI_API_KEY        — 발급키
 *   SOLAPI_API_SECRET     — 시크릿
 *   SOLAPI_SENDER         — 발신번호 (사전 등록 필요)
 *   SOLAPI_KAKAO_PFID     — 카카오 비즈니스 채널 PF ID (알림톡용)
 */

function envOrThrow(): {
  apiKey: string;
  apiSecret: string;
  sender: string;
  kakaoPfId?: string;
} {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  if (!apiKey || !apiSecret || !sender) {
    throw new Error('SOLAPI 환경변수 미설정');
  }
  return {
    apiKey,
    apiSecret,
    sender,
    kakaoPfId: process.env.SOLAPI_KAKAO_PFID,
  };
}

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const data = date + salt;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(data)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function normalizePhone(to: string): string {
  return to.replace(/[^0-9]/g, '');
}

async function sendInternal(
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const env = envOrThrow();
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: buildAuthHeader(env.apiKey, env.apiSecret),
    },
    body: JSON.stringify({ message: payload }),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      failedReason: (raw as { errorMessage?: string }).errorMessage ?? String(res.status),
      raw,
    };
  }
  return {
    ok: true,
    providerMessageId: (raw as { groupId?: string; messageId?: string }).messageId,
    raw,
  };
}

export const solapiSender: ChannelSender = {
  name: 'solapi',

  async sendSms(msg: SendMessage): Promise<SendResult> {
    const env = envOrThrow();
    const text = msg.title ? `[${msg.title}]\n${msg.body}` : msg.body;
    return sendInternal({
      to: normalizePhone(msg.to),
      from: env.sender,
      text,
      type: text.length > 90 ? 'LMS' : 'SMS',
      subject: msg.title,
    });
  },

  async sendAlimtalk(msg: SendMessage): Promise<SendResult> {
    const env = envOrThrow();
    if (!env.kakaoPfId || !msg.templateId) {
      return { ok: false, failedReason: 'KAKAO_TEMPLATE_REQUIRED' };
    }
    return sendInternal({
      to: normalizePhone(msg.to),
      from: env.sender,
      type: 'ATA', // Alimtalk
      kakaoOptions: {
        pfId: env.kakaoPfId,
        templateId: msg.templateId,
        variables: msg.templateVariables,
        disableSms: false, // 알림톡 실패 시 SMS 폴백 (Solapi 기본 동작)
      },
      text: msg.body,
    });
  },
};
