type SantaMariaBrandProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

export function SantaMariaBrand({ compact = false, showTagline = true, className = "" }: SantaMariaBrandProps) {
  const classes = ["santa-maria-brand", compact ? "compact" : "", className].filter(Boolean).join(" ");
  const label = showTagline ? "Santa Maria Soluções Imobiliárias" : "Santa Maria";

  return (
    <div className={classes} aria-label={label}>
      <img src="/santa-maria-symbol.svg" alt="" aria-hidden="true" />
      <span className="santa-maria-brand-text">
        <strong>SANTA MARIA</strong>
        {showTagline && <small>SOLUÇÕES IMOBILIÁRIAS</small>}
      </span>
    </div>
  );
}
