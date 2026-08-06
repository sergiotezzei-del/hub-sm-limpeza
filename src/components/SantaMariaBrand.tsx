type SantaMariaBrandProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

export function SantaMariaBrand({ compact = false, showTagline = true, className = "" }: SantaMariaBrandProps) {
  const classes = ["santa-maria-brand", compact ? "compact" : "", className].filter(Boolean).join(" ");
  const altText = showTagline ? "Santa Maria Solucoes Imobiliarias" : "Santa Maria";

  return (
    <div className={classes}>
      <img src="/santa-maria-logo-transparent.png" alt={altText} />
    </div>
  );
}
