import * as React from "react";
import { Input } from "./input";

interface CurrencyInputProps {
  valueReais: number | null;
  onChangeReais: (v: number | null) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Campo de valor em reais com máscara automática: a pessoa digita só números
 * (ex: 4800000) e o campo já mostra formatado (R$ 48.000,00), tratando os dois
 * últimos dígitos como centavos — igual campo de valor de banco/maquininha.
 */
export function CurrencyInput({ valueReais, onChangeReais, className, placeholder = "R$ 0,00" }: CurrencyInputProps) {
  const digitsFromReais = (r: number | null) => (r == null ? "" : String(Math.round(r * 100)));
  const [digits, setDigits] = React.useState(digitsFromReais(valueReais));

  // mantém sincronizado se o valor externo mudar (ex: form resetado)
  React.useEffect(() => {
    setDigits(digitsFromReais(valueReais));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueReais]);

  const display =
    digits === ""
      ? ""
      : (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    setDigits(raw);
    onChangeReais(raw === "" ? null : Number(raw) / 100);
  };

  return (
    <Input
      value={display}
      onChange={handleChange}
      inputMode="numeric"
      placeholder={placeholder}
      className={className}
    />
  );
}
