"""지점용 진입점 — frame_ops/pages/92_store_portal.py 실행"""
import runpy, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "frame_ops"))
runpy.run_path(str(Path(__file__).parent / "frame_ops" / "pages" / "92_store_portal.py"), run_name="__main__")
