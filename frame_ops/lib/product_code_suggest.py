"""내부 상품코드 제안 — 운영 연번 규칙 대신 빠른 테스트·등록용."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo


def suggest_internal_product_code(prefix: str = "SKU") -> str:
    """
    `접두어-YYYYMMDD-8자16진` 형식. 같은 초에 두 번 눌러도 UUID 덕에 충돌 가능성은 매우 낮음.
    실제 매장 연번·바코드 체계는 운영 규칙에 맞게 직접 입력하세요.
    """
    raw = (prefix or "SKU").strip() or "SKU"
    p = re.sub(r"[^0-9A-Za-z\-_]", "", raw) or "SKU"
    if len(p) > 24:
        p = p[:24]
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    u = uuid.uuid4().hex[:8].upper()
    return f"{p}-{now:%Y%m%d}-{u}"
