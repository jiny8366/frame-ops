export interface SendMessage {
  to: string; // E.164 또는 010 시작 (어댑터에서 변환)
  body: string;
  title?: string; // LMS 제목 또는 알림톡 강조 라인
  // 알림톡 전용
  templateId?: string;
  templateVariables?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  failedReason?: string;
  raw?: unknown;
}

export interface ChannelSender {
  name: string;
  /** SMS 단문 (LMS/MMS 자동) */
  sendSms(msg: SendMessage): Promise<SendResult>;
  /** 카카오 알림톡 (실패 시 SMS 폴백 책임은 호출자) */
  sendAlimtalk?(msg: SendMessage): Promise<SendResult>;
}
