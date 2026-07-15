"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import styles from "./teams.module.css";

const EMPTY_FORM = {
  name: "",
  primary_color: "#E10600",
  secondary_color: "#FFFFFF",
  active: true,
  logo_url: "",
};

function normaliseFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

export default function TeamsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Cargando escuderías...");

  useEffect(() => {
    let mounted = true;

    async function start() {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData?.user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("teams")
        .select("id, name, logo_url, primary_color, secondary_color, active, created_at")
        .order("name", { ascending: true });

      if (!mounted) return;

      if (error) {
        setMessage(`No se pudieron cargar las escuderías: ${error.message}`);
        setLoading(false);
        return;
      }

      setTeams(data ?? []);
      setMessage(data?.length ? "" : "Todavía no cargaste ninguna escudería.");
      setLoading(false);
    }

    start();

    return () => {
      mounted = false;
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [router, supabase]);

  async function reloadTeams() {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, logo_url, primary_color, secondary_color, active, created_at")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`No se pudo actualizar la lista: ${error.message}`);
      return;
    }

    setTeams(data ?? []);
    setMessage("");
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectLogo(event) {
    const file = event.target.files?.[0] ?? null;
    setLogoFile(file);

    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : form.logo_url || "");
  }

  function editTeam(team) {
    setEditingId(team.id);
    setForm({
      name: team.name,
      primary_color: team.primary_color || "#E10600",
      secondary_color: team.secondary_color || "#FFFFFF",
      active: team.active,
      logo_url: team.logo_url || "",
    });
    setLogoFile(null);
    setPreviewUrl(team.logo_url || "");
    setMessage(`Editando ${team.name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setPreviewUrl("");
    setMessage("");
  }

  async function uploadLogo() {
    if (!logoFile) return form.logo_url || null;

    const extension = logoFile.name.includes(".")
      ? logoFile.name.split(".").pop().toLowerCase()
      : "png";

    const cleanName = normaliseFileName(
      logoFile.name.replace(/\.[^/.]+$/, "") || "logo"
    );

    const path = `logos/${Date.now()}-${crypto.randomUUID()}-${cleanName}.${extension}`;

    const { error } = await supabase.storage
      .from("team-media")
      .upload(path, logoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: logoFile.type || undefined,
      });

    if (error) throw new Error(`No se pudo subir el logo: ${error.message}`);

    const { data } = supabase.storage.from("team-media").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveTeam(event) {
    event.preventDefault();

    const cleanName = form.name.trim();

    if (!cleanName) {
      setMessage("Escribí el nombre de la escudería.");
      return;
    }

    setSaving(true);
    setMessage(editingId ? "Guardando cambios..." : "Creando escudería...");

    try {
      const logoUrl = await uploadLogo();

      const payload = {
        name: cleanName,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        active: form.active,
        logo_url: logoUrl,
      };

      const query = editingId
        ? supabase.from("teams").update(payload).eq("id", editingId)
        : supabase.from("teams").insert(payload);

      const { error } = await query;

      if (error) throw new Error(error.message);

      await reloadTeams();
      resetForm();
      setMessage(editingId ? "Escudería actualizada." : "Escudería creada.");
    } catch (error) {
      setMessage(`No se pudo guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(team) {
    setMessage(`${team.active ? "Desactivando" : "Activando"} ${team.name}...`);

    const { error } = await supabase
      .from("teams")
      .update({ active: !team.active })
      .eq("id", team.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    await reloadTeams();
    setMessage(`${team.name} quedó ${team.active ? "inactiva" : "activa"}.`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>BOX BOX · RACE CONTROL</span>
          <h1>Escuderías</h1>
          <p>Creá y editá equipos, logos, colores y estado.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/login" className={styles.secondaryButton}>Sesión</Link>
          <Link href="/" className={styles.primaryButton}>Volver a BOX BOX</Link>
        </div>
      </header>

      <section className={styles.grid}>
        <form className={styles.formCard} onSubmit={saveTeam}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>{editingId ? "EDITAR" : "NUEVA"}</span>
              <h2>{editingId ? "Modificar escudería" : "Alta de escudería"}</h2>
            </div>
            {editingId && (
              <button type="button" className={styles.textButton} onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>

          <label className={styles.label}>
            Nombre
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Ej.: Ferrari"
            />
          </label>

          <div className={styles.colorGrid}>
            <label className={styles.label}>
              Color principal
              <div className={styles.colorControl}>
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(event) => updateField("primary_color", event.target.value)}
                />
                <input
                  value={form.primary_color}
                  onChange={(event) => updateField("primary_color", event.target.value)}
                  pattern="^#[0-9A-Fa-f]{6}$"
                  title="Usá un color hexadecimal, por ejemplo #E10600"
                />
              </div>
            </label>

            <label className={styles.label}>
              Color secundario
              <div className={styles.colorControl}>
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(event) => updateField("secondary_color", event.target.value)}
                />
                <input
                  value={form.secondary_color}
                  onChange={(event) => updateField("secondary_color", event.target.value)}
                  pattern="^#[0-9A-Fa-f]{6}$"
                  title="Usá un color hexadecimal, por ejemplo #FFFFFF"
                />
              </div>
            </label>
          </div>

          <label className={styles.label}>
            Logo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectLogo}
            />
            <small>JPG, PNG o WebP. Máximo configurado: 4 MB.</small>
          </label>

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => updateField("active", event.target.checked)}
            />
            <span>
              <strong>Escudería activa</strong>
              <small>Podrá seleccionarse para la temporada vigente.</small>
            </span>
          </label>

          <div
            className={styles.preview}
            style={{
              "--team-primary": form.primary_color,
              "--team-secondary": form.secondary_color,
            }}
          >
            <div className={styles.previewLogo}>
              {previewUrl ? (
                <img src={previewUrl} alt="Vista previa del logo" />
              ) : (
                <span>{form.name.trim().slice(0, 2).toUpperCase() || "BB"}</span>
              )}
            </div>
            <div>
              <small>VISTA PREVIA</small>
              <strong>{form.name.trim() || "Nueva escudería"}</strong>
              <span>{form.active ? "ACTIVA" : "INACTIVA"}</span>
            </div>
          </div>

          <button className={styles.saveButton} disabled={saving}>
            {saving
              ? "GUARDANDO..."
              : editingId
                ? "GUARDAR CAMBIOS"
                : "CREAR ESCUDERÍA"}
          </button>

          {message && <div className={styles.message}>{message}</div>}
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>BASE ONLINE</span>
              <h2>Escuderías cargadas</h2>
            </div>
            <strong className={styles.count}>{teams.length}</strong>
          </div>

          {loading && <p className={styles.empty}>Cargando...</p>}

          {!loading && teams.length === 0 && (
            <p className={styles.empty}>Todavía no hay escuderías.</p>
          )}

          <div className={styles.teamList}>
            {teams.map((team) => (
              <article
                className={`${styles.teamRow} ${team.active ? "" : styles.inactive}`}
                key={team.id}
                style={{
                  "--team-primary": team.primary_color,
                  "--team-secondary": team.secondary_color,
                }}
              >
                <div className={styles.teamLogo}>
                  {team.logo_url ? (
                    <img src={team.logo_url} alt={`Logo de ${team.name}`} />
                  ) : (
                    <span>{team.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>

                <div className={styles.teamInfo}>
                  <strong>{team.name}</strong>
                  <span>
                    <i style={{ background: team.primary_color }} />
                    <i style={{ background: team.secondary_color }} />
                    {team.active ? "Activa" : "Inactiva"}
                  </span>
                </div>

                <div className={styles.rowActions}>
                  <button type="button" onClick={() => editTeam(team)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className={team.active ? styles.dangerButton : styles.activateButton}
                    onClick={() => toggleActive(team)}
                  >
                    {team.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
