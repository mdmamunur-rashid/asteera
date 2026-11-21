import { getDefaultBrand } from "@/lib/settings";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, brand] = await Promise.all([searchParams, getDefaultBrand()]);
  return (
    <form action={login} className="login">
      {brand.logoUrl && (
        <img src={brand.logoUrl} alt={brand.name} style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain", display: "block", margin: "0 auto 12px" }} />
      )}
      <h2>{brand.name} ERP</h2>
      {error && <div className="err">{error}</div>}
      <label>Email or phone<input name="identifier" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn" style={{ width: "100%" }}>Sign in</button>
    </form>
  );
}
