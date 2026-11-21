"use client";
import { useState } from "react";

export default function ProductImageInput({
  initialUrl = "",
  compact = false,
}: {
  initialUrl?: string;
  compact?: boolean;
}) {
  const [val, setVal] = useState(initialUrl);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const img = new Image();
      img.onload = () => {
        const max = 240;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        setVal(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input type="hidden" name="imageUrl" value={val} />
      {val && (
        <img
          src={val}
          alt="Product"
          style={{ width: compact ? 32 : 44, height: compact ? 32 : 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
        />
      )}
      <input type="file" accept="image/*" onChange={onFile} style={{ maxWidth: compact ? 175 : 220, padding: 4, fontSize: 12 }} />
      {!compact && (
        <input
          type="text"
          value={val.startsWith("data:") ? "(Uploaded image)" : val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Or paste image URL"
          style={{ minWidth: 180 }}
        />
      )}
      {val && (
        <button type="button" className="link" onClick={() => setVal("")} title="Clear image">
          ✕
        </button>
      )}
    </div>
  );
}
