import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { changePassword, updateProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [s, { error, ok }] = await Promise.all([requireSession(), searchParams]);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.uid)).limit(1);

  return (
    <>
      <h2>My Profile</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}
      <div className="grid">
        <div className="card">
          <h3>Profile Info</h3>
          {u?.photoUrl && <img src={u.photoUrl} alt={u.name} style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />}
          <form action={updateProfile} className="form" style={{ gridTemplateColumns: "1fr" }}>
            <label>Full Name<input name="name" defaultValue={u?.name ?? ""} required /></label>
            <label>Photo URL<input name="photoUrl" defaultValue={u?.photoUrl ?? ""} placeholder="https://..." /></label>
            <label>Email<input value={u?.email ?? ""} disabled /></label>
            <label>Role<input value={u?.role ?? ""} disabled /></label>
            <button className="btn secondary">Update Profile</button>
          </form>
        </div>
        <div className="card">
          <h3>Change Password</h3>
          <form action={changePassword} className="form" style={{ gridTemplateColumns: "1fr" }}>
            <label>Current Password<input type="password" name="oldPassword" required /></label>
            <label>New Password<input type="password" name="newPassword" minLength={8} required /></label>
            <label>Confirm New Password<input type="password" name="confirmPassword" minLength={8} required /></label>
            <button className="btn">Change Password</button>
          </form>
        </div>
      </div>
    </>
  );
}
