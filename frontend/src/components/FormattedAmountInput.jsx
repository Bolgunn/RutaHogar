import React, { useRef } from "react";

const amountLabel = value => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));

export function formattedAmountCursorPosition(formatted, digitsBeforeCursor) {
  if (digitsBeforeCursor === 0) return 0;
  let seenDigits = 0;
  let position = formatted.length;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) seenDigits += 1;
    if (seenDigits >= digitsBeforeCursor) { position = index + 1; break; }
  }
  return position;
}

export default function FormattedAmountInput({ value, onChange, allowEmpty = false, maxDigits = 12, ...props }) {
  const inputRef = useRef(null);
  const maxLength = maxDigits + Math.floor((maxDigits - 1) / 3);
  const label = raw => allowEmpty && (raw === "" || raw == null) ? "" : amountLabel(raw);
  const changeValue = event => {
    const digitsBeforeCursor = event.target.value.slice(0, event.target.selectionStart || 0).replace(/\D/g, "").length;
    const nextRaw = event.target.value.replace(/\D/g, "").slice(0, maxDigits);
    onChange(nextRaw === "" && allowEmpty ? "" : Number(nextRaw));
    const formatted = label(nextRaw);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const position = formattedAmountCursorPosition(formatted, digitsBeforeCursor);
      input.setSelectionRange(position, position);
    });
  };
  return <input {...props} ref={inputRef} type="text" inputMode="numeric" autoComplete="off" maxLength={maxLength}
    value={label(value)} onChange={changeValue} />;
}
