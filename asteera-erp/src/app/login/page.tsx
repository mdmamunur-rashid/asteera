import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={login} className="login">
      <h2>{process.env.BRAND_NAME ?? "Asteera"} ERP</h2>
      {error && <div className="err">{error}</div>}
      <label>Email or phone<input name="identifier" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn" style={{ width: "100%" }}>Sign in</button>
    </form>
  );
}
