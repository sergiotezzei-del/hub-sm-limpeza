from __future__ import annotations

from pathlib import Path

APP_PATH = Path("src/App.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    text = APP_PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        'import { ProfileAvatarMenu } from "./components/ProfileAvatarMenu";\n',
        'import { ProfileAvatarMenu } from "./components/ProfileAvatarMenu";\nimport { downloadCleaningOrderWord } from "./modules/cleaning/services/cleaningOrderDocument";\n',
        "importação do gerador Word",
    )

    copy_order_block = '''  async function copyOrder(order: CleaningOrder) {
    const text = [
      "Pedido de Materiais - Sinval",
      `Solicitante: ${order.solicitante}`,
      `Data: ${order.data}`,
      "",
      ...order.itens.map((item) => `${item.productName} - ${item.quantity} ${item.unit}`),
    ].join("\\n");

    try {
      await navigator.clipboard.writeText(text);
      setNotice("Pedido copiado.");
    } catch {
      setNotice("Não foi possível copiar automaticamente.");
    }
  }

'''
    download_function = '''  async function downloadOrderWord(order: CleaningOrder) {
    try {
      await downloadCleaningOrderWord(order, inventoryProducts);
      setNotice("Documento Word pronto para enviar à Thelma.");
    } catch (error) {
      console.error("Erro ao gerar pedido em Word:", error);
      setNotice("Não foi possível gerar o documento Word agora.");
    }
  }

'''
    text = replace_once(
        text,
        copy_order_block,
        copy_order_block + download_function,
        "função para baixar Word",
    )

    text = replace_once(
        text,
        '''          onCopyOrder={copyOrder}
          onStartEdit={startEdit}''',
        '''          onCopyOrder={copyOrder}
          onDownloadWord={downloadOrderWord}
          canDownloadWord={hasCurrentPermission("painel-admin")}
          onStartEdit={startEdit}''',
        "props do Word nos pedidos",
    )

    text = replace_once(
        text,
        '''          onLogout={goToLogin}
          onCopyOrder={copyOrder}
        />''',
        '''          onLogout={goToLogin}
          onCopyOrder={copyOrder}
          onDownloadWord={downloadOrderWord}
          canDownloadWord={hasCurrentPermission("painel-admin")}
        />''',
        "props do Word no histórico",
    )

    old_orders_signature = '''function OrdersScreen({ orders, notice, editingOrderId, editDraft, onBack, onLogout, onCopyOrder, onStartEdit, onCancelEdit, onUpdateDraftItem, onRemoveDraftItem, onSaveEdit, onMarkDone, onRequestDelete }: { orders: CleaningOrder[]; notice: string; editingOrderId: string | null; editDraft: OrderItem[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void; onStartEdit: (order: CleaningOrder) => void; onCancelEdit: () => void; onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void; onRemoveDraftItem: (itemId: string) => void; onSaveEdit: (order: CleaningOrder) => void; onMarkDone: (order: CleaningOrder) => void; onRequestDelete: (order: CleaningOrder) => void }) {'''
    new_orders_signature = '''function OrdersScreen({ orders, notice, editingOrderId, editDraft, onBack, onLogout, onCopyOrder, onDownloadWord, canDownloadWord, onStartEdit, onCancelEdit, onUpdateDraftItem, onRemoveDraftItem, onSaveEdit, onMarkDone, onRequestDelete }: { orders: CleaningOrder[]; notice: string; editingOrderId: string | null; editDraft: OrderItem[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void; onDownloadWord: (order: CleaningOrder) => void; canDownloadWord: boolean; onStartEdit: (order: CleaningOrder) => void; onCancelEdit: () => void; onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void; onRemoveDraftItem: (itemId: string) => void; onSaveEdit: (order: CleaningOrder) => void; onMarkDone: (order: CleaningOrder) => void; onRequestDelete: (order: CleaningOrder) => void }) {'''
    text = replace_once(text, old_orders_signature, new_orders_signature, "assinatura da tela de pedidos")

    old_orders_buttons = '''<button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button><button className="ghost-button" type="button" onClick={() => onStartEdit(order)}>Editar Pedido</button>'''
    new_orders_buttons = '''<button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button>{canDownloadWord && <button className="primary-button" type="button" onClick={() => onDownloadWord(order)}>Baixar Word para Thelma</button>}<button className="ghost-button" type="button" onClick={() => onStartEdit(order)}>Editar Pedido</button>'''
    text = replace_once(text, old_orders_buttons, new_orders_buttons, "botão Word nos pedidos")

    old_history_signature = '''function HistoryScreen({ title, subtitle, orders, onBack, onLogout, onCopyOrder }: { title: string; subtitle: string; orders: CleaningOrder[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void }) {'''
    new_history_signature = '''function HistoryScreen({ title, subtitle, orders, onBack, onLogout, onCopyOrder, onDownloadWord, canDownloadWord }: { title: string; subtitle: string; orders: CleaningOrder[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void; onDownloadWord: (order: CleaningOrder) => void; canDownloadWord: boolean }) {'''
    text = replace_once(text, old_history_signature, new_history_signature, "assinatura do histórico")

    old_history_buttons = '''<div className="button-grid"><button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button></div>'''
    new_history_buttons = '''<div className="button-grid"><button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button>{canDownloadWord && <button className="primary-button" type="button" onClick={() => onDownloadWord(order)}>Baixar Word para Thelma</button>}</div>'''
    text = replace_once(text, old_history_buttons, new_history_buttons, "botão Word no histórico")

    APP_PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
