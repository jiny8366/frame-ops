'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionEditor } from '@/components/admin/section-editors';
import { Button } from '@/components/ui/button';
import type { SectionKind } from '@/lib/home/section-config';

const KIND_LABELS: Record<string, { label: string; emoji: string }> = {
  hero: { label: 'Hero 배너', emoji: '🎯' },
  product_grid: { label: '상품 그리드', emoji: '🛍️' },
  category_chips: { label: '카테고리 칩', emoji: '🏷️' },
  banner_strip: { label: '띠 배너', emoji: '📢' },
  countdown: { label: '카운트다운', emoji: '⏰' },
  brand_story: { label: '브랜드 스토리', emoji: '✨' },
};

interface Section {
  id: string;
  kind: string;
  title: string | null;
  config: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export default function AdminHomePage() {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [editing, setEditing] = useState<Section | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/home/sections', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setSections(j.sections ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSection(kind: string) {
    const r = await fetch('/api/admin/home/sections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        sortOrder: (sections?.length ?? 0) + 1,
      }),
    });
    setAdding(false);
    if (r.ok) {
      const j = await r.json();
      setEditing(j.section);
      load();
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/home/sections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm('이 섹션을 삭제하시겠습니까?')) return;
    await fetch(`/api/admin/home/sections/${id}`, { method: 'DELETE' });
    load();
  }

  async function move(s: Section, dir: -1 | 1) {
    if (!sections) return;
    const idx = sections.findIndex((x) => x.id === s.id);
    const other = sections[idx + dir];
    if (!other) return;
    await Promise.all([
      patch(s.id, { sortOrder: other.sortOrder }),
      patch(other.id, { sortOrder: s.sortOrder }),
    ]);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">홈 섹션 관리</h1>
          <p className="mt-1 text-sm text-gray-500">홈화면 상단부터 노출 순서대로 정렬</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" target="_blank" className="text-sm text-gray-500 hover:text-gray-900">
            홈 미리보기 ↗
          </Link>
          <Button onClick={() => setAdding(true)}>+ 섹션 추가</Button>
        </div>
      </header>

      {adding && (
        <section className="rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50 p-4">
          <div className="text-sm font-medium">추가할 섹션 유형을 선택하세요</div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => createSection(k)}
                className="rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-brand-500"
              >
                <div className="text-xl">{v.emoji}</div>
                <div className="mt-1 text-sm font-medium">{v.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-right">
            <button onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:underline">
              취소
            </button>
          </div>
        </section>
      )}

      <div className="space-y-2">
        {sections?.map((s, idx) => {
          const meta = KIND_LABELS[s.kind] ?? { label: s.kind, emoji: '📦' };
          return (
            <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(s, -1)}
                      disabled={idx === 0}
                      className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(s, 1)}
                      disabled={idx === (sections?.length ?? 0) - 1}
                      className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <span className="text-2xl">{meta.emoji}</span>
                  <div>
                    <div className="font-semibold">{s.title || meta.label}</div>
                    <div className="text-xs text-gray-500">
                      #{s.sortOrder} · {meta.label}
                      {!s.isActive && <span className="ml-2 text-red-600">비활성</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={s.isActive}
                      onChange={(e) => patch(s.id, { isActive: e.target.checked })}
                      className="mr-1"
                    />
                    노출
                  </label>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(s)}>
                    편집
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(s.id)}>
                    삭제
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {sections?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
            아직 섹션이 없습니다. 상단의 + 섹션 추가 버튼을 눌러 시작하세요.
          </div>
        )}
      </div>

      {editing && (
        <EditDialog
          section={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await patch(editing.id, body);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  section,
  onClose,
  onSave,
}: {
  section: Section;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(section.title ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(section.config);
  const [startsAt, setStartsAt] = useState(section.startsAt ? section.startsAt.slice(0, 16) : '');
  const [endsAt, setEndsAt] = useState(section.endsAt ? section.endsAt.slice(0, 16) : '');
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(section.config, null, 2));
  const [error, setError] = useState<string | null>(null);

  function save() {
    let finalConfig = config;
    if (advanced) {
      try {
        finalConfig = JSON.parse(jsonText);
      } catch {
        setError('JSON 형식 오류');
        return;
      }
    }
    onSave({
      title: title || null,
      config: finalConfig,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">섹션 편집 — {section.kind}</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500">관리자용 제목 (선택)</label>
            <input
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">노출 시작 (선택)</label>
              <input
                type="datetime-local"
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">노출 종료 (선택)</label>
              <input
                type="datetime-local"
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold">콘텐츠</h4>
              <label className="text-xs text-gray-500">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={advanced}
                  onChange={(e) => {
                    setAdvanced(e.target.checked);
                    if (e.target.checked) setJsonText(JSON.stringify(config, null, 2));
                    else {
                      try {
                        setConfig(JSON.parse(jsonText));
                      } catch {
                        /* keep current */
                      }
                    }
                  }}
                />
                JSON 고급 편집
              </label>
            </div>

            {advanced ? (
              <textarea
                className="h-72 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
            ) : (
              <SectionEditor
                kind={section.kind as SectionKind}
                config={config}
                onChange={setConfig}
              />
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save}>저장</Button>
        </div>
      </div>
    </div>
  );
}
