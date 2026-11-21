"use client";
export default function PrintButton({ floating = false }: { floating?: boolean }) {
  return (
    <button type="button" className={floating ? "print-float" : "btn secondary noprint"} onClick={() => window.print()}>
      Print Invoice
    </button>
  );
}
