from __future__ import annotations

import integrate_task_board as integration


original_replace_once = integration.replace_once


def replace_validated(text: str, old: str, new: str, label: str) -> str:
    if label == "prop de Afazeres no menu Admin":
        count = text.count(old)
        if count != 2:
            raise RuntimeError(f"{label}: esperado 2 trechos, encontrado {count}")
        first = text.find(old)
        second = text.find(old, first + len(old))
        return text[:second] + new + text[second + len(old):]
    return original_replace_once(text, old, new, label)


integration.replace_once = replace_validated
integration.main()
