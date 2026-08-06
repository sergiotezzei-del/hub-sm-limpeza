type SantaMariaBrandProps = {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
};

export function SantaMariaBrand({ compact = false, showTagline = true, className = "" }: SantaMariaBrandProps) {
  const classes = ["santa-maria-brand", compact ? "compact" : "", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <img src="/santa-maria-logo.jpeg" alt={showTagline ? "Santa Maria Solucoes Imobiliarias" : "Santa Maria"} />
    </div>
  );
}
