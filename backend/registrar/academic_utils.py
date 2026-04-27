"""Shared academic label normalization (school year strings, etc.)."""

import re


def normalize_academic_year_label(value: str | None) -> str:
    """
    Canonical form for matching and uniqueness: strip ends and collapse internal whitespace.

    Prevents duplicate AcademicHistory keys that differ only by spaces (e.g. '2025-2026' vs '2025-2026 ').
    """
    if value is None:
        return ''
    s = str(value).strip()
    if not s:
        return ''
    return re.sub(r'\s+', ' ', s)
