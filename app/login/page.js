"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "radial-gradient(circle at 80% 0, rgba(225,6,0,.18), transparent 28%), #090909",
    color: "#fff",
  },
  card: {
    width: "min(460px, 100%)",
    background: "#151515",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 22,
    padding: 24,
    boxShadow: "0 24px 80px rgba(0,0,0,.45)",
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: ".08em",
    margin: "14px 0 7px",
    color: "#bdbdbd",
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background: "#0d0d0d",
    color: "#fff",
    outline: "none",
  },
  button: {
    width: "100%",
    marginTop: 18,
    padding: "13px 16px",
    border: 0,
    borderRadius: 12,
    background: "#e10600",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondary: {
    width: "100%",
    marginTop: 10,
    padding: "11px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background: "#222",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  message: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,.06)",
    color: "#d7d7d7",
    lineHeight: 1.45,
  },
};

function getNextPath() {
  if (typeof window === "undefined") return "/race-control";
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") ? next : "/race-control";
}

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [season, setSeason] = useState("");
  const [message, setMessage] = useState("Comprobando conexión...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkConnection() {
      const { data: authData } = await supabase.auth.getUser();
      setUserEmail(authData?.user?.email ?? "");

      const { data, error } = await supabase
        .from("seasons")
        .select("name, year, active")
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        setMessage(`Error de conexión: ${error.message}`);
        return;
      }

      setSeason(data ? `${data.name} (${data.year})` : "Sin temporada activa");
      setMessage(authData?.user ? "Sesión de administrador activa." : "Ingresá para acceder a Race Control.");
    }

    checkConnection();
  }, [supabase]);

  async function signIn(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("Ingresando...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(`No se pudo ingresar: ${error.message}`);
      return;
    }

    window.location.href = getNextPath();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserEmail("");
    setMessage("Sesión cerrada.");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".16em", color: "#ff6b66" }}>
          BOX BOX · RACE CONTROL
        </div>
        <h1 style={{ margin: "10px 0 4px", fontSize: 38, lineHeight: 1 }}>
          Administrador
        </h1>
        <p style={{ margin: 0, color: "#aaa" }}>
          Acceso privado al panel de dirección de carrera.
        </p>

        {userEmail ? (
          <>
            <div style={styles.message}>
              <strong>Sesión activa</strong><br />
              {userEmail}<br />
              Temporada: {season || "cargando..."}
            </div>
            <button type="button" style={styles.button} onClick={() => { window.location.href = getNextPath(); }}>
              ENTRAR A RACE CONTROL
            </button>
            <button type="button" style={styles.secondary} onClick={signOut}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <form onSubmit={signIn}>
            <label style={styles.label} htmlFor="email">EMAIL</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={styles.input}
            />

            <label style={styles.label} htmlFor="password">CONTRASEÑA</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={styles.input}
            />

            <button disabled={loading} style={styles.button}>
              {loading ? "INGRESANDO..." : "INGRESAR"}
            </button>
          </form>
        )}

        <div style={styles.message}>{message}</div>
      </section>
    </main>
  );
}
