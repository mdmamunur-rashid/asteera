"use client";
import { useState } from "react";

export default function SignatureInput({ initialUrl }: { initialUrl: string }) {
  const [val, setVal] = useState(initialUrl);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setVal(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input type="hidden" name="authorized_signature_url" value={val} />
      <div className="toolbar">
        <input type="file" accept="image/*" onChange={onFile} />
        <input
          type="text"
          value={val.startsWith("data:") ? "(Uploaded image)" : val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Or paste signature image URL (leave blank for empty)"
          style={{ minWidth: 260 }}
        />
        {val && (
          <button type="button" className="btn danger" onClick={() => setVal("")}>
            Clear (Leave Blank)
          </button>
        )}
      </div>
      {val && (
        <div style={{ marginTop: 6 }}>
          <img src={val} alt="Authorized signature preview" style={{ maxHeight: 60, border: "1px solid var(--line)", padding: 4, borderRadius: 6, background: "#fff" }} />
        </div>
      )}
    </div>
  );
}
