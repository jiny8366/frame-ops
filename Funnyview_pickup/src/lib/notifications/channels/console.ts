import type { ChannelSender, SendMessage, SendResult } from './types';

/**
 * 로컬 개발용 콘솔 어댑터.
 * 실제 발송 없이 stdout 에 출력하고 ok:true 반환.
 */
export const consoleSender: ChannelSender = {
  name: 'console',

  async sendSms(msg: SendMessage): Promise<SendResult> {
    // eslint-disable-next-line no-console
    console.log(
      `[notification/sms] → ${msg.to}\n  ${msg.title ? `[${msg.title}] ` : ''}${msg.body}`,
    );
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  },

  async sendAlimtalk(msg: SendMessage): Promise<SendResult> {
    // eslint-disable-next-line no-console
    console.log(
      `[notification/alimtalk] → ${msg.to} (template=${msg.templateId})\n  ${msg.body}`,
    );
    return { ok: true, providerMessageId: `console-ata-${Date.now()}` };
  },
};
