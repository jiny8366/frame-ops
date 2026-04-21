"""상품코드 → QR·Code128 PNG 바이트 (Streamlit st.image 용)."""

from __future__ import annotations

import io
from typing import Any


def product_code_to_qr_png(code: str) -> bytes | None:
    try:
        import qrcode
    except ImportError:
        return None
    buf = io.BytesIO()
    img = qrcode.make(code, box_size=4, border=2)
    img.save(buf, format="PNG")
    return buf.getvalue()


def product_code_to_code128_png(code: str) -> bytes | None:
    try:
        from barcode.codex import Code128
        from barcode.writer import ImageWriter
    except ImportError:
        return None
    # Code128은 ASCII; 우리 코드는 A-Z0-9-
    safe = (code or "").strip()
    if not safe:
        return None
    buf = io.BytesIO()
    try:
        Code128(safe, writer=ImageWriter()).write(buf, options={"write_text": True, "module_height": 12.0})
    except Exception:
        return None
    return buf.getvalue()


def render_barcode_row(code: str) -> Any:
    """Streamlit 컨텍스트 밖에서도 bytes만 반환 가능. 호출부에서 st.image."""
    return product_code_to_qr_png(code), product_code_to_code128_png(code)
