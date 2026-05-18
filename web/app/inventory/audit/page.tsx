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
import * as XLSX from 'xlsx';
import { useSession } from '@/hooks/useSession';
import { hasPermission, isHqRole } from '@/lib/auth/permissions';
import { formatColor } from '@/lib/product-codes';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
}

const accessibleStoresFetcher = async (): Promise<StoreOpt[]> => {
  const res = await fetch('/api/auth/accessible-stores', { cache: 'no-store' });
  const json = (await res.json()) as {
    data: { stores: StoreOpt[]; current_store_id: string } | null;
    error: string | null;
  };
  if (json.error || !json.data) throw new Error(json.error ?? '매장 목록 응답 없음');
  return json.data.stores;
};

interface PreviewRow {
  line_id: string;
  product_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  current_stock: number;
  /** audit_date 시점 추산 시스템 재고 = current_stock − delta_after_audit */
  baseline_at_audit: number;
  /** 사용자가 엑셀에 적은 실재고 카운팅 */
  counted_quantity: number;
  /** ★ 실재고조사 증감 = counted_quantity − baseline_at_audit. 분실/오기록/도난 등으로 발견된 차이 */
  audit_delta: number;
  /** audit_date 이후 net 거래 (+매입+환불-판매-출고±이동) */
  delta_after_audit: number;
  /** 적용 후 최종 재고 = counted + delta_after_audit */
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
  const isHq = isHqRole(session?.role_code ?? '');

  const [auditDate, setAuditDate] = useState<string>(todayIsoKst());
  const [note, setNote] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  // 본사 계정은 매장 선택 가능. 매장 staff 는 자기 매장으로 자동 사용.
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accessibleStores } = useSWR<StoreOpt[]>(
    isHq ? 'accessible-stores' : null,
    accessibleStoresFetcher
  );

  // 본사 계정인데 매장 미선택 시 session.store_id 를 기본값으로
  useEffect(() => {
    if (isHq && !selectedStoreId && session?.store_id) {
      setSelectedStoreId(session.store_id);
    }
  }, [isHq, selectedStoreId, session?.store_id]);

  const effectiveStoreId = isHq ? selectedStoreId : session?.store_id ?? '';

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
    if (!effectiveStoreId) {
      toast.error(isHq ? '재고조사를 적용할 매장을 선택하세요.' : '매장 정보가 없습니다. 다시 로그인하세요.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('audit_date', auditDate);
      fd.append('store_id', effectiveStoreId);
      if (note) fd.append('note', note);
      const res = await fetch('/api/inventory/audits/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as {
        data: { audit_id: string; total_lines: number; matched_lines: number; unmatched_lines: number } | null;
        error: string | null;
      };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '업로드 실패', { duration: 8000 });
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
      toast.error(e instanceof Error ? e.message : '업로드 실패', { duration: 8000 });
    } finally {
      setUploading(false);
    }
  }, [file, auditDate, note, effectiveStoreId, isHq, mutateList]);

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
    const totalApplied = matched.reduce((s, r) => s + r.applied_quantity, 0);
    // 실재고조사 증감 (audit_delta) 통계 — 본래 의미의 증감
    const totalAuditDelta = matched.reduce((s, r) => s + r.audit_delta, 0);
    const auditDeltaPositive = matched
      .filter((r) => r.audit_delta > 0)
      .reduce((s, r) => s + r.audit_delta, 0);
    const auditDeltaNegative = matched
      .filter((r) => r.audit_delta < 0)
      .reduce((s, r) => s + r.audit_delta, 0);
    const discrepancyCount = matched.filter((r) => r.audit_delta !== 0).length;
    return {
      totalCounted,
      totalApplied,
      totalAuditDelta,
      auditDeltaPositive,
      auditDeltaNegative,
      discrepancyCount,
      matchedCount: matched.length,
    };
  }, [detail]);

  // 엑셀 다운로드 — 미리보기 + 헤더 메타데이터 + 미매칭 시트.
  // 근거 자료로 보관 가능하도록 시점/매장/적용여부/실재고조사 증감 포함.
  const handleExportXlsx = useCallback(() => {
    if (!detail) return;
    const { header, preview, unmatched } = detail;

    // 매장 정보 — list 에서 조회 (header.store_id 만 있어서)
    const storeRow = (list ?? []).find((r) => r.id === header.id);
    const storeLabel = storeRow
      ? `${storeRow.store_name ?? ''} (${storeRow.store_code ?? ''})`
      : '—';

    const fmtNum = (n: number) => (typeof n === 'number' ? n : 0);
    const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);

    // --- 시트 1: 헤더 메타 + 통계 ---
    const summarySheet: (string | number)[][] = [
      ['재고조사 결과 보고서'],
      [],
      ['조사일 (audit_date)', header.audit_date],
      ['적용 매장', storeLabel],
      ['업로드 시각', new Date(header.uploaded_at).toLocaleString('ko-KR')],
      ['적용 시각', header.applied_at ? new Date(header.applied_at).toLocaleString('ko-KR') : '(미적용)'],
      ['상태', header.status === 'applied' ? '적용 완료' : header.status === 'draft' ? '미리보기 (미적용)' : '취소'],
      ['메모', header.note ?? ''],
      [],
      ['── 통계 ──'],
      ['총 라인', header.total_lines],
      ['매칭 라인', header.matched_lines],
      ['미매칭 라인', unmatched.length],
      [],
      ['── 실재고조사 증감 (★ 본래 의미) ──'],
      ['차이 발견 SKU 수', stats.discrepancyCount],
      ['증가 합계 (+)', stats.auditDeltaPositive],
      ['감소 합계 (−)', stats.auditDeltaNegative],
      ['순증감', fmtSigned(stats.totalAuditDelta)],
      [],
      ['실재고 합계 (counted)', stats.totalCounted],
      ['적용 후 합계 (counted + audit 이후 거래)', stats.totalApplied],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);
    wsSummary['!cols'] = [{ wch: 32 }, { wch: 32 }];

    // --- 시트 2: 매칭 라인 본문 ---
    const matchedHeader = [
      'NO.',
      '브랜드',
      '제품번호',
      '컬러',
      '조사일 추산재고',   // baseline_at_audit
      '실재고 (카운팅)',   // counted_quantity
      '★ 실재고조사 증감',   // audit_delta — 본래 의미
      '조사 이후 거래(±)',   // delta_after_audit
      '적용 후 최종',      // applied_quantity
      '현재 재고(참고)',   // current_stock
    ];
    const matchedRows = preview
      .filter((r) => r.match_status === 'matched')
      .map((r, idx) => [
        idx + 1,
        r.brand_name ?? '',
        r.style_code ?? '',
        formatColor(r.color_code),
        fmtNum(r.baseline_at_audit),
        fmtNum(r.counted_quantity),
        fmtSigned(r.audit_delta),
        fmtSigned(r.delta_after_audit),
        fmtNum(r.applied_quantity),
        fmtNum(r.current_stock),
      ]);
    const wsMatched = XLSX.utils.aoa_to_sheet([matchedHeader, ...matchedRows]);
    wsMatched['!cols'] = [
      { wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];

    // --- 시트 3: 미매칭 (참고) ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, '요약');
    XLSX.utils.book_append_sheet(wb, wsMatched, '재고조사 결과');
    if (unmatched.length > 0) {
      const unmatchedHeader = ['NO.', '브랜드(원본)', '제품번호(원본)', '컬러(원본)', '실재고'];
      const unmatchedRows = unmatched.map((u, idx) => [
        idx + 1,
        u.raw_brand ?? '',
        u.raw_style_code ?? '',
        u.raw_color_code ?? '',
        u.counted_quantity,
      ]);
      const wsUn = XLSX.utils.aoa_to_sheet([unmatchedHeader, ...unmatchedRows]);
      wsUn['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsUn, '미매칭');
    }

    const storeCode = storeRow?.store_code ?? 'STORE';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
      .format(new Date())
      .replace(/-/g, '');
    XLSX.writeFile(wb, `재고조사_${storeCode}_${header.audit_date}_생성${today}.xlsx`);
    toast.success(`Excel 다운로드 — ${matchedRows.length}건 (미매칭 ${unmatched.length}건)`);
  }, [detail, list, stats]);

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
            {isHq && (
              <label className="flex flex-col gap-1">
                <span className="text-caption1 text-[var(--color-label-secondary)]">적용할 매장</span>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                >
                  <option value="">매장 선택…</option>
                  {(accessibleStores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.store_code})
                    </option>
                  ))}
                </select>
                <span className="text-caption2 text-[var(--color-label-tertiary)]">
                  본사 계정 — 적용 대상 매장을 선택하세요.
                </span>
              </label>
            )}
            <label className={`flex flex-col gap-1 ${isHq ? '' : 'lg:col-span-2'}`}>
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
                  실재고조사 증감 발견 <strong>{stats.discrepancyCount}건</strong>{' '}
                  (+{stats.auditDeltaPositive} / {stats.auditDeltaNegative}) ·
                  적용 후 총 수량 {stats.totalApplied.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportXlsx}
                  title="조사일 추산 / 실재고 / 증감 / 적용 후 등 모든 컬럼을 엑셀로 내보내기 (근거 자료)"
                  className="pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]"
                >
                  📥 Excel 다운로드
                </button>
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
                  <span className="text-caption1 font-semibold text-[var(--color-system-green)] self-center">
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

            <div className="px-4 py-2 bg-[var(--color-fill-quaternary)] text-caption2 text-[var(--color-label-secondary)]">
              <strong>읽는 방법:</strong> <em>조사일 추산</em> = audit_date 시점 시스템 재고
              (현재 − 그 이후 거래). <em>실재고</em> = 사용자가 카운팅한 실물 수량.{' '}
              <strong className="text-[var(--color-label-primary)]">★ 재고조사 증감</strong> ={' '}
              실재고 − 조사일 추산 (분실/오기록 등으로 발견된 차이). <em>적용 후</em> = 실재고 + 그
              이후 거래 = 적용 확정 시 fo_stock 에 들어가는 값.
            </div>

            <div className="overflow-auto max-h-[600px]">
              <table className="data-list-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>브랜드</th>
                    <th>제품번호</th>
                    <th>컬러</th>
                    <th className="num">조사일 추산</th>
                    <th className="num">실재고</th>
                    <th className="num">★ 재고조사 증감</th>
                    <th className="num">조사 후 거래</th>
                    <th className="num">적용 후</th>
                    <th className="num">현재(참고)</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.preview.map((r) => {
                    const isDiscrepancy = r.audit_delta !== 0;
                    return (
                      <tr
                        key={r.line_id}
                        className={isDiscrepancy ? 'bg-[var(--color-system-orange)]/5' : ''}
                      >
                        <td>{r.brand_name ?? '—'}</td>
                        <td className="code">{r.style_code ?? '—'}</td>
                        <td className="code">{formatColor(r.color_code)}</td>
                        <td className="num">{r.baseline_at_audit}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {r.counted_quantity}
                        </td>
                        <td
                          className="num"
                          style={{
                            color:
                              r.audit_delta > 0
                                ? 'var(--color-system-green)'
                                : r.audit_delta < 0
                                  ? 'var(--color-system-red)'
                                  : 'var(--color-label-tertiary)',
                            fontWeight: 700,
                          }}
                          title="실재고조사로 발견된 진짜 증감 = 실재고 − 조사일 추산"
                        >
                          {r.audit_delta > 0 ? `+${r.audit_delta}` : r.audit_delta}
                        </td>
                        <td
                          className="num"
                          style={{
                            color:
                              r.delta_after_audit > 0
                                ? 'var(--color-system-green)'
                                : r.delta_after_audit < 0
                                  ? 'var(--color-system-red)'
                                  : 'var(--color-label-tertiary)',
                          }}
                          title="audit_date 이후 POS 거래 net (+매입+환불-판매-출고±이동)"
                        >
                          {r.delta_after_audit > 0
                            ? `+${r.delta_after_audit}`
                            : r.delta_after_audit}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>
                          {r.applied_quantity}
                        </td>
                        <td className="num text-[var(--color-label-tertiary)]">
                          {r.current_stock}
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
