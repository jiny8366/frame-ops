#!/usr/bin/env python3
"""로컬 AI 런타임(Ollama) 상태 점검 + 개발용 권장 설정 출력."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:11434"


def _get_json(path: str):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=3) as r:
        return json.load(r)


def main() -> int:
    print("[local-ai] Ollama endpoint:", BASE)
    try:
        tags = _get_json("/api/tags")
    except urllib.error.URLError as e:
        print("[local-ai] ERROR: Ollama 서버에 연결하지 못했습니다.")
        print("           Ollama 앱을 실행한 뒤 다시 시도하세요.")
        print("           detail:", e)
        return 1

    models = [m.get("name", "") for m in tags.get("models", []) if m.get("name")]
    if not models:
        print("[local-ai] 설치된 모델이 없습니다. 예: ollama pull qwen2.5-coder:7b")
        return 1

    print("[local-ai] 설치 모델:")
    for m in models:
        print(" -", m)

    preferred = (
        "qwen2.5-coder:7b"
        if "qwen2.5-coder:7b" in models
        else ("deepseek-coder-v2:latest" if "deepseek-coder-v2:latest" in models else models[0])
    )

    # 간단 추론 점검
    req = urllib.request.Request(
        f"{BASE}/api/generate",
        data=json.dumps({"model": preferred, "prompt": "reply with OK", "stream": False}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            response = json.load(r).get("response", "").strip()
    except Exception as e:  # noqa: BLE001
        print(f"[local-ai] 추론 테스트 실패 ({preferred}): {e}")
        return 1

    print(f"[local-ai] 추론 테스트({preferred}) OK ->", response[:80] or "(empty)")

    print("\n[local-ai] 개발툴(OpenAI 호환) 권장 환경변수")
    print(f"export OPENAI_BASE_URL={BASE}/v1")
    print("export OPENAI_API_KEY=ollama")
    print(f"export OPENAI_MODEL={preferred}")
    print("# 이후 OpenAI 호환 클라이언트에서 로컬 모델 사용 가능")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
