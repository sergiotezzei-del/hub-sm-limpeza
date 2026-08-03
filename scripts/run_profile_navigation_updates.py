from __future__ import annotations

import apply_profile_navigation_updates as updater


def replace_with_context(text: str, old: str, new: str, label: str) -> str:
    if label == "foto no cabeçalho do usuário":
        count = text.count(old)
        if count < 2:
            raise RuntimeError(f"{label}: esperado ao menos 2 trechos, encontrado {count}")
        position = text.rfind(old)
        return text[:position] + new + text[position + len(old):]

    if label == "cabeçalho com foto do admin":
        count = text.count(old)
        if count < 2:
            raise RuntimeError(f"{label}: esperado ao menos 2 trechos, encontrado {count}")
        position = text.find(old)
        return text[:position] + new + text[position + len(old):]

    return original_replace_once(text, old, new, label)


original_replace_once = updater.replace_once
updater.replace_once = replace_with_context
updater.main()
