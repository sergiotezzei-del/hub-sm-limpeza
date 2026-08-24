type ExclusiveChoiceProps = {
  name: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  className?: string;
};

export function ExclusiveChoice({ name, value, onChange, className = "" }: ExclusiveChoiceProps) {
  return (
    <fieldset className={`marketing-exclusive-choice ${className}`.trim()}>
      <legend>Imóvel é Exclusividade? *</legend>
      <label><input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} /> Sim</label>
      <label><input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} /> Não</label>
    </fieldset>
  );
}
