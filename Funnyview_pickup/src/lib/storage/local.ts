import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter, UploadResult } from './types';

/**
 * 로컬 파일시스템 어댑터 (개발용).
 * /public/uploads/<folder>/<hash>.<ext> 에 저장 → /uploads/... 공개 URL.
 *
 * 프로덕션은 S3/R2/Cloudflare Images 등 별도 어댑터 권장.
 */

function publicDir(): string {
  return path.join(process.cwd(), 'public', 'uploads');
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

export const localStorage: StorageAdapter = {
  name: 'local',

  async upload({ bytes, mimeType, folder }: Parameters<StorageAdapter['upload']>[0]): Promise<UploadResult> {
    const ext = extFromMime(mimeType);
    const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16);
    const subdir = folder ?? 'misc';
    const filename = `${hash}.${ext}`;
    const dir = path.join(publicDir(), subdir);
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, bytes);
    return {
      url: `/uploads/${subdir}/${filename}`,
      key: `${subdir}/${filename}`,
      size: bytes.length,
      mimeType,
    };
  },

  async delete(key: string) {
    const fp = path.join(publicDir(), key);
    try {
      await fs.unlink(fp);
    } catch {
      // ignore
    }
  },
};
