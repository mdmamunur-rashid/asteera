import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ALL_MODULES, canAccess, requireSession, resolvePermissions } from "@/lib/auth";
import { createUser, updateUserAccess } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [s, { error, ok }] = await Promise.all([requireSession(), searchParams]);
  if (!canAccess(s, "users")) redirect("/");

  const users = await db.select().from(schema.users).orderBy(asc(schema.users.id));

  return (
    <>
      <h2>Users &amp; Role Control</h2>
      {error && <div className="err">{error}</div>}
      {ok && <div className="card" style={{ background: "#d1fae5", color: "#065f46" }}>{ok}</div>}

      <details className="card">
        <summary><b>+ Add User</b></summary>
        <form action={createUser} className="form" style={{ marginTop: 12 }}>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Phone<input name="phone" /></label>
          <label>Password (8+ chars)<input name="password" type="password" minLength={8} required /></label>
          <label>Role
            <select name="role" defaultValue="employee">
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
              <option value="moderator">Moderator</option>
              <option value="user">User</option>
            </select>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <small style={{ color: "var(--muted)" }}>Module Permissions (leave unchecked to use role defaults):</small>
            <div className="toolbar" style={{ marginTop: 6 }}>
              {ALL_MODULES.map((m) => (
                <label key={m} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" name="perms" value={m} /> {m}
                </label>
              ))}
            </div>
          </div>
          <button className="btn">Create User</button>
        </form>
      </details>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email / Phone</th><th>Role</th><th>Status</th><th>Permissions &amp; Access</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const perms = resolvePermissions(u.role, u.permissions);
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td>{u.email}<br /><small>{u.phone}</small></td>
                  <td><span className="badge">{u.role}</span></td>
                  <td><span className={`badge ${u.status === "Active" ? "ok" : "bad"}`}>{u.status}</span></td>
                  <td>
                    <form action={updateUserAccess} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <div className="toolbar" style={{ marginBottom: 0 }}>
                        <select name="role" defaultValue={u.role}>
                          <option value="admin">Admin</option>
                          <option value="employee">Employee</option>
                          <option value="moderator">Moderator</option>
                          <option value="user">User</option>
                        </select>
                        <select name="status" defaultValue={u.status}>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                        <input name="newPassword" type="password" placeholder="Reset pass (8+)" style={{ width: 140 }} />
                        <button className="btn secondary">Save</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                        {ALL_MODULES.map((m) => (
                          <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <input type="checkbox" name="perms" value={m} defaultChecked={perms.includes(m)} /> {m}
                          </label>
                        ))}
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
