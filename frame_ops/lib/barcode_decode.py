"""카메라 촬영 이미지에서 바코드·QR 문자열 추출 (OpenCV)."""

from __future__ import annotations


def is_barcode_decode_available() -> bool:
    try:
        import cv2  # noqa: F401
        return True
    except ImportError:
        return False


def decode_barcode_from_bytes(image_bytes: bytes) -> str | None:
    """
    JPEG/PNG 등 이미지 바이트에서 1차원 코드(EAN 등) 또는 QR을 읽습니다.
    opencv-python-headless 미설치 시 None을 반환합니다.
    """
    try:
        import cv2  # type: ignore[import-untyped]
        import numpy as np  # type: ignore[import-untyped]
    except ImportError:
        return None

    if not image_bytes:
        return None

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    det = cv2.barcode.BarcodeDetector()
    text, _, _ = det.detectAndDecode(img)
    if text:
        return str(text).strip() or None

    ok, texts, _, _ = det.detectAndDecodeMulti(img)
    if ok and texts is not None:
        for t in texts:
            if t:
                s = str(t).strip()
                if s:
                    return s

    qr = cv2.QRCodeDetector()
    val, _, _ = qr.detectAndDecode(img)
    if val:
        s = str(val).strip()
        if s:
            return s

    return None
