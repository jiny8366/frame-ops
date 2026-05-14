// Frame Ops Web — 재고조사 업로드 & 적용 페이지
// 흐름:
//   1) inventory 페이지에서 현재고 엑셀 다운로드 → 실재고조사 (1-3일 소요).
//   2) 변경 수량 적은 엑셀을 이 페이지에서 업로드.
//   3) audit_date (실재고조사 시점) 선택. 서버가 그 시점 이후 거래량을 자동 보정.
//   4) 미리보기 확인 후 '적용' 클릭 → fo_stock 갱신.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useSession } from '@/hooks/useSession';
import { hasPermission } from '@/lib/auth/permissions';
import { formatColor } from '@/lib/product-codes';

interface PreviewRow {
  line_id: string;
  product_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  current_stock: number;
  counted_quantity: number;
  delta_after_audit: number;
  applied_quantity: number;
  match_status: 'matched' | 'unmatched' | 'skipped';
}

interface UnmatchedRow {
  id: string;
  raw_brand: string | null;
  raw_style_code: string | null;
  raw_color_code: string | null;
  counted_quantity: number;
  match_status: string;
}

interface AuditHeader {
  id: string;
  store_id: string;
  audit_date: string;
  uploaded_at: string;
  applied_at: string | null;
  status: 'draft' | 'applied' | 'cancelled';
  total_lines: number;
  matched_lines: number;
  note: string | null;
}

interface AuditDetail {
  header: AuditHeader;
  preview: PreviewRow[];
  unmatched: UnmatchedRow[];
}

interface AuditListRow {
  id: string;
  store_code: string | null;
  store_name: string | null;
  audit_date: string;
  uploaded_at: string;
  applied_at: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  note: string | null;
}

function todayIsoKst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

const auditListFetcher = async (url: string): Promise<AuditListRow[]> => {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data: AuditListRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

const auditDetailFetcher = async (url: string): Promise<AuditDetail> => {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data: AuditDetail | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

export default function StockAuditPage() {
  const { session } = useSession();
  const canEdit = hasPermission(session?.permissions, 'inventory_edit_stock');

  const [auditDate, setAuditDate] = useState<string>(todayIsoKst());
  const [note, setNote] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: list, mutate: mutateList } = useSWR<AuditListRow[]>(
    '/api/inventory/audits',
    auditListFetcher,
    { refreshInterval: 30_000 }
  );

  const { data: detail, mutate: mutateDetail } = useSWR<AuditDetail>(
    currentAuditId ? `/api/inventory/audits/${currentAuditId}` : null,
    auditDetailFetcher
  );

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast.error('엑셀 파일을 선택하세요.');
      return;
    }
    if (!auditDate) {
      toast.error('실재고조사 날짜를 선택하세요.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('audit_date', auditDate);
      if (note) fd.append('note', note);
      const res = await fetch('/api/inventory/audits/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as {
        data: { audit_id: string; total_lines: number; matched_lines: number; unmatched_lines: number } | null;
        error: string | null;
      };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '업로드 실패');
        return;
      }
      toast.success(
        `업로드 완료 — ${json.data.matched_lines}/${json.data.total_lines}건 매칭 (${json.data.unmatched_lines}건 미매칭)`,
        { duration: 5000 }
      );
      setCurrentAuditId(json.data.audit_id);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await mutateList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  }, [file, auditDate, note, mutateList]);

  const handleApply = useCallback(async () => {
    if (!currentAuditId) return;
    if (!confirm('재고조사 결과를 적용하면 fo_stock 의 재고 수량이 즉시 변경됩니다. 계속하시겠습니까?')) {
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/inventory/audits/${currentAuditId}/apply`, { method: 'POST' });
      const json = (await res.json()) as {
        data: { applied_lines: number; skipped_lines: number; total_quantity: number } | null;
        error: string | null;
      };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '적용 실패');
        return;
      }
      toast.success(
        `적용 완료 — ${json.data.applied_lines}개 상품 갱신 (스킵 ${json.data.skipped_lines}, 총 수량 ${json.data.total_quantity})`,
        { duration: 6000 }
      );
      await Promise.all([mutateList(), mutateDetail()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '적용 실패');
    } finally {
      setApplying(false);
    }
  }, [currentAuditId, mutateList, mutateDetail]);

  const handleDiscardDraft = useCallback(async () => {
    if (!currentAuditId) return;
    if (!confirm('이 업로드를 삭제합니다. 다시 업로드해야 합니다. 계속하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/inventory/audits/${currentAuditId}`, { method: 'DELETE' });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '삭제 실패');
        return;
      }
      toast.success('업로드 삭제');
      setCurrentAuditId(null);
      await mutateList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패');
    }
  }, [currentAuditId, mutateList]);

  const stats = useMemo(() => {
    const rows = detail?.preview ?? [];
    const matched = rows.filter((r) => r.match_status === 'matched');
    const totalCounted = matched.reduce((s, r) => s + r.counted_quantity, 0);
    const totalDelta = matched.reduce((s, r) => s + r.delta_after_audit, 0);
    const totalApplied = matched.reduce((s, r) => s + r.applied_quantity, 0);
    const changedCount = matched.filter((r) => r.applied_quantity !== r.current_stock).length;
    return { totalCounted, totalDelta, totalApplied, changedCount, matchedCount: matched.length };
  }, [detail]);

  useEffect(() => {
    if (!canEdit) return; // 권한 가드 — 외부에서도 처리되지만 클라이언트 가드도
  }, [canEdit]);

  if (!canEdit) {
    return (
      <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 flex items-center justify-center">
        <p className="text-callout text-[var(--color-system-red)]">재고조사 권한이 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <header>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">재고조사</h1>
          <p className="text-caption2 text-[var(--color-label-tertiary)] mt-1">
            실재고조사 후 엑셀을 업로드하면 조사 시점 이후의 POS 거래(판매·환불·매입·이동) 를
            자동 보정하여 현재고를 산출합니다.
          </p>
        </header>

        {/* 업로드 영역 */}
        <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <h2 className="text-headline font-semibold">1. 엑셀 업로드</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption1 text-[var(--color-label-secondary)]">실재고조사 날짜 (KST)</span>
              <input
                type="date"
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                max={todayIsoKst()}
                className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
              <span className="text-caption2 text-[var(--color-label-tertiary)]">
                이 날짜 영업종료 이후 POS 거래는 자동 가감됩니다.
              </span>
            </label>
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-caption1 text-[var(--color-label-secondary)]">메모 (선택)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 2026.5월 정기 재고조사"
                className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onPickFile}
              className="text-callout"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
            >
              {uploading ? '업로드 중…' : '업로드 + 미리보기'}
            </button>
          </div>
          <div className="text-caption2 text-[var(--color-label-tertiary)] bg-[var(--color-fill-quaternary)] rounded-lg p-3">
            엑셀 컬럼: <strong>브랜드 · 제품번호 · 컬러번호 · 현재고</strong> (재고 조회 페이지의
            Excel 다운로드 형식 그대로 사용). NO./라인/카테고리 컬럼은 매칭에 사용되지 않습니다.
          </div>
        </section>

        {/* 미리보기 + 적용 */}
        {detail && (
          <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
            <header className="p-4 border-b border-[var(--color-separator-opaque)] flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  2. 미리보기 · 적용
                </h2>
                <p className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
                  조사일: <strong>{detail.header.audit_date}</strong> · 매칭 {stats.matchedCount}건 ·
                  변경 {stats.changedCount}건 · 적용 후 총 수량 {stats.totalApplied.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                {detail.header.status === 'draft' && (
                  <>
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className="pressable touch-target rounded-lg px-3 py-2 text-caption1 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)]"
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={applying || stats.matchedCount === 0}
                      className="pressable touch-target rounded-xl bg-[var(--color-system-green)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
                    >
                      {applying ? '적용 중…' : '✓ 적용'}
                    </button>
                  </>
                )}
                {detail.header.status === 'applied' && (
                  <span className="text-caption1 font-semibold text-[var(--color-system-green)]">
                    ✓ 적용 완료 ({new Date(detail.header.applied_at ?? '').toLocaleString('ko-KR')})
                  </span>
                )}
              </div>
            </header>

            {detail.unmatched.length > 0 && (
              <div className="px-4 py-3 bg-[var(--color-system-orange)]/10 border-b border-[var(--color-separator-opaque)]">
                <details className="text-caption1">
                  <summary className="cursor-pointer text-[var(--color-system-orange)] font-semibold">
                    ⚠ 매칭 실패 {detail.unmatched.length}건 — 상품 등록 확인 후 재업로드 필요
                  </summary>
                  <table className="w-full mt-2 text-caption2">
                    <thead>
                      <tr className="text-[var(--color-label-tertiary)]">
                        <th className="text-left p-1">브랜드</th>
                        <th className="text-left p-1">제품번호</th>
                        <th className="text-left p-1">컬러</th>
                        <th className="text-right p-1">수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.unmatched.map((u) => (
                        <tr key={u.id}>
                          <td className="p-1">{u.raw_brand ?? '—'}</td>
                          <td className="p-1 code">{u.raw_style_code ?? '—'}</td>
                          <td className="p-1 code">{u.raw_color_code ?? '—'}</td>
                          <td className="p-1 text-right tabular-nums">{u.counted_quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}

            <div className="overflow-auto max-h-[600px]">
              <table className="data-list-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>브랜드</th>
                    <th>제품번호</th>
                    <th>컬러</th>
                    <th className="num">현재</th>
                    <th className="num">실재고</th>
                    <th className="num">조사 후 거래</th>
                    <th className="num">적용 수량</th>
                    <th className="num">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.preview.map((r) => {
                    const diff = r.applied_quantity - r.current_stock;
                    return (
                      <tr key={r.line_id}>
                        <td>{r.brand_name ?? '—'}</td>
                        <td className="code">{r.style_code ?? '—'}</td>
                        <td className="code">{formatColor(r.color_code)}</td>
                        <td className="num">{r.current_stock}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {r.counted_quantity}
                        </td>
                        <td
                          className="num"
                          style={{
                            color:
                              r.delta_after_audit > 0
                                ? 'var(--color-system-green)'
                                : r.delta_after_audit < 0
                                  ? 'var(--color-system-red)'
                                  : undefined,
                          }}
                        >
                          {r.delta_after_audit > 0 ? `+${r.delta_after_audit}` : r.delta_after_audit}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>
                          {r.applied_quantity}
                        </td>
                        <td
                          className="num"
                          style={{
                            color:
                              diff > 0
                                ? 'var(--color-system-green)'
                                : diff < 0
                                  ? 'var(--color-system-red)'
                                  : 'var(--color-label-tertiary)',
                            fontWeight: 600,
                          }}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 이력 */}
        <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          <header className="p-4 border-b border-[var(--color-separator-opaque)]">
            <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
              재고조사 이력
            </h2>
          </header>
          {(list ?? []).length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              아직 업로드된 재고조사가 없습니다.
            </p>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <table className="data-list-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>조사일</th>
                    <th>매장</th>
                    <th>업로드</th>
                    <th>적용</th>
                    <th className="num">건수</th>
                    <th className="num">매칭</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {(list ?? []).map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setCurrentAuditId(r.id)}
                      style={{ cursor: 'pointer' }}
                      className={r.id === currentAuditId ? 'bg-[var(--color-fill-quaternary)]' : ''}
                    >
                      <td>{r.audit_date}</td>
                      <td>{r.store_name ?? '—'}</td>
                      <td>{new Date(r.uploaded_at).toLocaleString('ko-KR')}</td>
                      <td>
                        {r.status === 'applied' ? (
                          <span className="text-[var(--color-system-green)] font-semibold">
                            ✓ 적용
                          </span>
                        ) : r.status === 'draft' ? (
                          <span className="text-[var(--color-system-orange)]">대기</span>
                        ) : (
                          <span className="text-[var(--color-label-tertiary)]">취소</span>
                        )}
                      </td>
                      <td className="num">{r.total_lines}</td>
                      <td className="num">{r.matched_lines}</td>
                      <td className="text-caption2 text-[var(--color-label-tertiary)]">
                        {r.note ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
