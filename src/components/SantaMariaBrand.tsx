type SantaMariaBrandProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

export function SantaMariaBrand({ compact = false, showTagline = true, className = "" }: SantaMariaBrandProps) {
  const classes = ["santa-maria-brand", compact ? "compact" : "", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <img src="/santa-maria-symbol.svg" alt="Santa Maria Soluções Imobiliárias" />
      <div>
        <strong>SANTA MARIA</strong>
        {showTagline && <span>SOLUÇÕES IMOBILIÁRIAS</span>}
      </div>
    </div>
  );
}
