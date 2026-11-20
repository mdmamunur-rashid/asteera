"use client";
export default function PrintButton() {
  return <button type="button" className="btn secondary noprint" onClick={() => window.print()}>Print</button>;
}
