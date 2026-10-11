"""Explicit card-scoped path validation, before any runtime/install action."""
import os,re
from pathlib import Path

def card_run(card,run):
    if not re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)+',card):
        raise ValueError('CARD_RUN_REQUIRED')
    root=Path(os.environ.get('HANAMESH_RUNS_ROOT',Path.home()/'.cache/hanamesh-runs')).absolute()
    if root.name!='hanamesh-runs' or root.parent.name!='.cache' or '.dsh' in root.parts:
        raise ValueError('RUNS_ROOT_NOT_ISOLATED')
    card_root=root/card
    raw=Path(os.path.abspath(run))
    if not raw.is_relative_to(card_root) or card_root.resolve()!=card_root or raw.resolve()!=raw:
        raise ValueError('RUN_NOT_THIS_CARD')
    if not raw.is_dir() or raw.stat().st_uid!=os.getuid():
        raise ValueError('RUN_NOT_OWNED')
    return raw
