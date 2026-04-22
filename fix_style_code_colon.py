"""
fo_products.style_code / product_code 에서 콜론(:) 제거
  예: "01:01" → "0101",  "12:34:56" → "123456"

사용법:
  cd /Users/jinykim/Desktop/frame_ops
  python fix_style_code_colon.py          # 드라이런 (조회만)
  python fix_style_code_colon.py --apply  # 실제 DB 수정
"""
from __future__ import annotations

import sys
from pathlib import Path

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "frame_ops"))

from dotenv import load_dotenv
load_dotenv(BASE / ".env", override=True)

from frame_ops.lib.supabase_client import get_supabase  # noqa: E402

APPLY = "--apply" in sys.argv


def main() -> None:
    sb = get_supabase()

    # ── 1. 콜론이 포함된 모든 제품 조회 ──────────────────────────────────────
    rows = (
        sb.table("fo_products")
        .select("id, product_code, style_code, color_code")
        .like("style_code", "%:%")
        .order("style_code")
        .execute()
        .data
        or []
    )

    if not rows:
        print("콜론(:)이 포함된 style_code가 없습니다. 수정 불필요.")
        return

    print(f"{'[DRY RUN]' if not APPLY else '[APPLY]'} 대상 제품: {len(rows)}개\n")
    print(f"{'ID':<40} {'style_code(현재)':<22} {'style_code(변경)':<22} {'product_code(변경 후)'}")
    print("-" * 110)

    updates: list[dict] = []
    for r in rows:
        old_st = (r["style_code"] or "").strip()
        new_st = old_st.replace(":", "")
        col    = (r["color_code"] or "").strip()
        old_pc = (r["product_code"] or "").strip()

        # product_code 재구성: style_code 변경분만 반영
        if old_pc:
            # old_pc 가 "{old_st}-{col}" 패턴이면 교체, 아니면 그냥 콜론만 제거
            if old_st and old_pc.startswith(old_st):
                new_pc = new_st + old_pc[len(old_st):]
            else:
                new_pc = old_pc.replace(":", "")
        else:
            new_pc = new_st + ("-" + col if col else "")

        updates.append({
            "id": r["id"],
            "new_style_code": new_st,
            "new_product_code": new_pc,
            "old_style_code": old_st,
        })
        print(f"{r['id']!s:<40} {old_st:<22} {new_st:<22} {new_pc}")

    print()

    if not APPLY:
        print("※ 실제 수정하려면:  python fix_style_code_colon.py --apply")
        return

    # ── 2. 실제 업데이트 ────────────────────────────────────────────────────
    ok = 0
    fail = 0
    for u in updates:
        try:
            sb.table("fo_products").update({
                "style_code": u["new_style_code"],
                "product_code": u["new_product_code"],
            }).eq("id", u["id"]).execute()
            ok += 1
            print(f"  ✓ {u['old_style_code']} → {u['new_style_code']}")
        except Exception as e:
            fail += 1
            print(f"  ✗ {u['old_style_code']} 실패: {e}")

    print(f"\n완료: 성공 {ok}개 / 실패 {fail}개")

    # ── 3. 캐시 무효화 힌트 ─────────────────────────────────────────────────
    if ok > 0:
        print("\n⚠️  Streamlit 앱을 재시작(또는 캐시 초기화)해야 변경사항이 반영됩니다.")
        print("   Railway 재배포 또는 앱 메뉴 → 'Clear cache' 를 실행하세요.")


if __name__ == "__main__":
    main()
