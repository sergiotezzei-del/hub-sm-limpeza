export function MasterMapShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog master-map-shortcut-dialog" role="dialog" aria-modal="true" aria-label="Ajuda de atalhos">
        <div className="master-map-panel-head">
          <div>
            <p className="eyebrow">Mapa Mestre</p>
            <h2>Atalhos disponiveis</h2>
            <p>Funcionam no modo edicao quando nenhum campo de texto esta em uso.</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </div>

        <dl className="master-map-shortcut-list">
          <div><dt>Enter</dt><dd>Criar quadro irmao.</dd></div>
          <div><dt>Shift + Enter</dt><dd>Criar quadro irmao anterior, quando houver quadro selecionado.</dd></div>
          <div><dt>Tab</dt><dd>Criar quadro filho.</dd></div>
          <div><dt>F2</dt><dd>Editar titulo do quadro selecionado.</dd></div>
          <div><dt>Escape</dt><dd>Cancelar edicao, criacao ou painel aberto.</dd></div>
          <div><dt>Ctrl/Cmd + Z</dt><dd>Desfazer ultima criacao, edicao ou mudanca de outline feita nesta sessao.</dd></div>
          <div><dt>Ctrl/Cmd + F</dt><dd>Focar a busca existente do Mapa Mestre.</dd></div>
          <div><dt>?</dt><dd>Abrir esta ajuda.</dd></div>
        </dl>
      </section>
    </div>
  );
}
