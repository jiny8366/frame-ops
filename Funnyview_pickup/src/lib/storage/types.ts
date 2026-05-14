export interface UploadResult {
  url: string; // 공개 접근 URL (절대 또는 절대경로)
  key: string; // 저장소 내부 키
  size: number;
  mimeType: string;
}

export interface StorageAdapter {
  name: string;
  upload(args: {
    bytes: Buffer;
    filename: string;
    mimeType: string;
    folder?: string;
  }): Promise<UploadResult>;
  delete(key: string): Promise<void>;
}
