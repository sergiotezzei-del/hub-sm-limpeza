from __future__ import annotations

import reorganize_main_menu as menu_reorganizer


def replace_first_validated(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count < 1:
        raise RuntimeError(f"{label}: trecho não encontrado")
    return text.replace(old, new, 1)


menu_reorganizer.replace_once = replace_first_validated
menu_reorganizer.main()
