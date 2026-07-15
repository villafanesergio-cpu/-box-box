"use client";

import { createClient } from "../../lib/supabase/client";

export default function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      style={{
        padding: "12px 15px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.12)",
        color: "#fff",
        background: "#24242b",
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      Cerrar sesión
    </button>
  );
}
