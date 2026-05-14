'use client';

import { useRef, useState } from 'react';

export function ImagePicker({
  value,
  onChange,
  folder,
}: {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    if (folder) fd.set('folder', folder);
    try {
      const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'UPLOAD_FAILED');
        return;
      }
      const j = await res.json();
      onChange(j.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… 또는 /uploads/…"
          className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '📁 파일'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            ✕
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={onPick}
      />
      {error && <p className="text-xs text-red-600">{errorLabel(error)}</p>}
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="h-32 w-full rounded-lg border border-gray-200 object-cover"
        />
      )}
    </div>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case 'FILE_TOO_LARGE':
      return '파일이 5MB 를 초과합니다';
    case 'UNSUPPORTED_TYPE':
      return '지원하지 않는 형식 (png/jpg/webp/gif/svg)';
    case 'FORBIDDEN':
      return '권한 없음';
    default:
      return code;
  }
}
