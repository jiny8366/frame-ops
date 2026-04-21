"""본사어드민 진입점 — frame_ops/pages/90_admin_portal.py 실행"""
import runpy, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "frame_ops"))
runpy.run_path(str(Path(__file__).parent / "frame_ops" / "pages" / "90_admin_portal.py"), run_name="__main__")
