import { consoleSender } from './console';
import { solapiSender } from './solapi';
import type { ChannelSender } from './types';

/**
 * env NOTIFICATION_PROVIDER 로 활성 sender 결정:
 *   solapi  → SolapiSender (실제 발송)
 *   console → ConsoleSender (개발 기본값)
 */
export function getActiveSender(): ChannelSender {
  const choice = (process.env.NOTIFICATION_PROVIDER ?? 'console').toLowerCase();
  if (choice === 'solapi') return solapiSender;
  return consoleSender;
}

export type { ChannelSender, SendMessage, SendResult } from './types';
