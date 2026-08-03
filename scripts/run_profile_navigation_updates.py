from __future__ import annotations

import apply_profile_navigation_updates as updater


CONTEXTUAL_LABELS = {
    "foto no cabeçalho do usuário",
    "cabeçalho com foto do admin",
}


def replace_with_context(text: str, old: str, new: str, label: str) -> str:
    if label in CONTEXTUAL_LABELS:
        count = text.count(old)
        if count < 2:
            raise RuntimeError(f"{label}: esperado ao menos 2 trechos, encontrado {count}")
        position = text.rfind(old)
        return text[:position] + new + text[position + len(old):]
    return original_replace_once(text, old, new, label)


original_replace_once = updater.replace_once
updater.replace_once = replace_with_context
updater.main()
