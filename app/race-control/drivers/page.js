"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import styles from "./drivers.module.css";

const DRIVING_STYLES = [
  "Agresivo",
  "Calculador",
  "Consistente",
  "Defensivo",
  "Remontador",
  "Arriesgado",
  "Técnico",
  "Caótico",
  "Kamikaze",
  "Regular",
  "Personalizado",
];

const EMPTY_FORM = {
  name: "",
  racingNumber: "",
  teamId: "",
  drivingStyle: "Consistente",
  customDrivingStyle: "",
  active: true,
  photoBackgroundUrl: "",
  photoTransparentUrl: "",
};

function safeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

function MediaInput({ label, help, accept, file, existingUrl, onChange }) {
  const preview = file ? URL.createObjectURL(file) : existingUrl;

  return (
    <label className={styles.mediaField}>
      <span>{label}</span>
      <input type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      <small>{help}</small>
      {preview && (
        <div className={styles.mediaPreview}>
          {file?.type?.startsWith("video/") || (!file && /\.(mp4|webm)(\?|$)/i.test(existingUrl || "")) ? (
            <video src={preview} muted autoPlay loop playsInline />
          ) : (
            <img src={preview} alt={`Vista previa de ${label}`} />
          )}
        </div>
      )}
    </label>
  );
}

export default function DriversPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [season, setSeason] = useState(null);
  const [teams, setTeams] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState({
    background: null,
    transparent: null,
    celebration: null,
  });
  const [editingId, setEditingId] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Cargando pilotos...");

  const assignmentByDriver = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.driver_id, assignment])),
    [assignments]
  );

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams]
  );

  const rows = useMemo(
    () =>
      drivers.map((driver) => {
        const assignment = assignmentByDriver.get(driver.id);
        return {
          ...driver,
          assignment,
          team: assignment ? teamById.get(assignment.team_id) : null,
        };
      }),
    [drivers, assignmentByDriver, teamById]
  );

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.replace("/login");
        return;
      }

      const { data: activeSeason, error: seasonError } = await supabase
        .from("seasons")
        .select("id, name, year")
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (seasonError || !activeSeason) {
        setMessage("No se encontró una temporada activa.");
        setLoading(false);
        return;
      }

      setSeason(activeSeason);
      await loadAll(activeSeason.id, mounted);
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function loadAll(seasonId = season?.id, mounted = true) {
    if (!seasonId) return;

    const [teamsResult, driversResult, assignmentsResult] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, logo_url, primary_color, secondary_color, active")
        .order("name", { ascending: true }),
      supabase
        .from("drivers")
        .select("id, name, driving_style, custom_driving_style, photo_background_url, photo_transparent_url, face_photo_url, celebration_media_url, active, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("season_driver_teams")
        .select("id, season_id, driver_id, team_id, racing_number, active")
        .eq("season_id", seasonId),
    ]);

    if (!mounted) return;

    const error = teamsResult.error || driversResult.error || assignmentsResult.error;
    if (error) {
      setMessage(`No se pudieron cargar los datos: ${error.message}`);
      setLoading(false);
      return;
    }

    setTeams(teamsResult.data ?? []);
    setDrivers(driversResult.data ?? []);
    setAssignments(assignmentsResult.data ?? []);
    setLoading(false);
    setMessage("");
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFile(field, file) {
    setFiles((current) => ({ ...current, [field]: file }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFiles({ background: null, transparent: null, celebration: null });
    setEditingId(null);
    setEditingAssignmentId(null);
    setMessage("");
  }

  function editDriver(row) {
    setEditingId(row.id);
    setEditingAssignmentId(row.assignment?.id ?? null);
    setForm({
      name: row.name,
      racingNumber: row.assignment?.racing_number?.toString() ?? "",
      teamId: row.assignment?.team_id ?? "",
      drivingStyle: row.driving_style,
      customDrivingStyle: row.custom_driving_style ?? "",
      active: row.active,
      photoBackgroundUrl: row.photo_background_url ?? "",
      photoTransparentUrl: row.photo_transparent_url ?? "",
    });
    setFiles({ background: null, transparent: null, celebration: null });
    setMessage(`Editando ${row.name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadMedia(file, folder, fallbackUrl) {
    if (!file) return fallbackUrl || null;

    const extension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : file.type.startsWith("video/")
        ? "mp4"
        : "webp";

    const base = safeFileName(file.name.replace(/\.[^/.]+$/, "") || folder);
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;

    const { error } = await supabase.storage
      .from("driver-media")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (error) throw new Error(error.message);

    return supabase.storage.from("driver-media").getPublicUrl(path).data.publicUrl;
  }

  async function saveDriver(event) {
    event.preventDefault();

    const cleanName = form.name.trim();
    const number = Number(form.racingNumber);

    if (!cleanName || !Number.isInteger(number) || number < 0 || number > 999 || !form.teamId) {
      setMessage("Completá nombre, número válido y escudería.");
      return;
    }

    if (form.drivingStyle === "Personalizado" && !form.customDrivingStyle.trim()) {
      setMessage("Escribí el estilo personalizado.");
      return;
    }

    setSaving(true);
    setMessage(editingId ? "Guardando cambios..." : "Creando piloto...");

    try {
      const [backgroundUrl, transparentUrl, celebrationUrl] = await Promise.all([
        uploadMedia(files.background, "background", form.photoBackgroundUrl),
        uploadMedia(files.transparent, "transparent", form.photoTransparentUrl),
        uploadMedia(files.celebration, "celebration", form.celebrationMediaUrl),
      ]);

      const driverPayload = {
        name: cleanName,
        driving_style: form.drivingStyle,
        custom_driving_style:
          form.drivingStyle === "Personalizado" ? form.customDrivingStyle.trim() : null,
        photo_background_url: backgroundUrl,
        photo_transparent_url: transparentUrl,
        celebration_media_url: celebrationUrl,
        active: form.active,
      };

      let driverId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from("drivers")
          .update(driverPayload)
          .eq("id", editingId);

        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("drivers")
          .insert(driverPayload)
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        driverId = data.id;
      }

      const assignmentPayload = {
        season_id: season.id,
        driver_id: driverId,
        team_id: form.teamId,
        racing_number: number,
        active: form.active,
      };

      if (editingAssignmentId) {
        const { error } = await supabase
          .from("season_driver_teams")
          .update(assignmentPayload)
          .eq("id", editingAssignmentId);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("season_driver_teams")
          .insert(assignmentPayload);

        if (error) throw new Error(error.message);
      }

      await loadAll(season.id);
      resetForm();
      setMessage(editingId ? "Piloto actualizado." : "Piloto creado.");
    } catch (error) {
      const duplicateNumber = error.message?.includes("season_driver_teams_season_id_racing_number_key");
      const duplicateName = error.message?.includes("drivers_name_key");

      setMessage(
        duplicateNumber
          ? "Ese número ya está usado por otro piloto en esta temporada."
          : duplicateName
            ? "Ya existe un piloto con ese nombre."
            : `No se pudo guardar: ${error.message}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    const next = !row.active;
    setMessage(`${next ? "Activando" : "Desactivando"} ${row.name}...`);

    const updates = [
      supabase.from("drivers").update({ active: next }).eq("id", row.id),
    ];

    if (row.assignment?.id) {
      updates.push(
        supabase
          .from("season_driver_teams")
          .update({ active: next })
          .eq("id", row.assignment.id)
      );
    }

    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    await loadAll(season.id);
    setMessage(`${row.name} quedó ${next ? "activo" : "inactivo"}.`);
  }

  const selectedTeam = teamById.get(form.teamId);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>BOX BOX · {season?.name || "TEMPORADA"}</span>
          <h1>Pilotos</h1>
          <p>Alta, edición, escudería y archivos visuales.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/race-control" className={styles.secondaryButton}>Race Control</Link>
          <Link href="/" className={styles.primaryButton}>Volver a BOX BOX</Link>
        </div>
      </header>

      <section className={styles.grid}>
        <form className={styles.formCard} onSubmit={saveDriver}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>{editingId ? "EDITAR" : "NUEVO"}</span>
              <h2>{editingId ? "Modificar piloto" : "Alta de piloto"}</h2>
            </div>
            {editingId && (
              <button type="button" className={styles.textButton} onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>

          <div className={styles.twoColumns}>
            <label className={styles.label}>
              Nombre
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Ej.: Sergio"
              />
            </label>

            <label className={styles.label}>
              Número
              <input
                required
                type="number"
                min="0"
                max="999"
                value={form.racingNumber}
                onChange={(event) => updateField("racingNumber", event.target.value)}
                placeholder="11"
              />
            </label>
          </div>

          <label className={styles.label}>
            Escudería
            <select
              required
              value={form.teamId}
              onChange={(event) => updateField("teamId", event.target.value)}
            >
              <option value="">Seleccionar escudería</option>
              {teams.filter((team) => team.active || team.id === form.teamId).map((team) => (
                <option value={team.id} key={team.id}>{team.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Estilo de manejo
            <select
              value={form.drivingStyle}
              onChange={(event) => updateField("drivingStyle", event.target.value)}
            >
              {DRIVING_STYLES.map((style) => <option key={style}>{style}</option>)}
            </select>
          </label>

          {form.drivingStyle === "Personalizado" && (
            <label className={styles.label}>
              Estilo personalizado
              <input
                value={form.customDrivingStyle}
                onChange={(event) => updateField("customDrivingStyle", event.target.value)}
                placeholder="Ej.: agresivo pero limpio"
              />
            </label>
          )}

          <div className={`${styles.mediaGrid} ${styles.twoMedia}`}>
            <MediaInput
              label="Foto con fondo"
              help="Para la ficha completa."
              accept="image/jpeg,image/png,image/webp"
              file={files.background}
              existingUrl={form.photoBackgroundUrl}
              onChange={(file) => updateFile("background", file)}
            />

            <MediaInput
              label="Foto sin fondo"
              help="PNG o WebP transparente para tablas y podios."
              accept="image/png,image/webp"
              file={files.transparent}
              existingUrl={form.photoTransparentUrl}
              onChange={(file) => updateFile("transparent", file)}
            />

            <MediaInput
              label="Animación de celebración"
              help="MP4, WebM o GIF. Si no cargás nada, se usará la foto con fondo."
              accept="video/mp4,video/webm,image/gif"
              file={files.celebration}
              existingUrl={form.celebrationMediaUrl}
              onChange={(file) => updateFile("celebration", file)}
            />

          </div>

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => updateField("active", event.target.checked)}
            />
            <span>
              <strong>Piloto activo</strong>
              <small>Podrá seleccionarse en Modo Carrera.</small>
            </span>
          </label>

          <div
            className={styles.driverPreview}
            style={{
              "--team-primary": selectedTeam?.primary_color || "#E10600",
              "--team-secondary": selectedTeam?.secondary_color || "#FFFFFF",
            }}
          >
            <div className={styles.bigNumber}>#{form.racingNumber || "00"}</div>
            <div className={styles.previewImage}>
              {files.transparent || form.photoTransparentUrl ? (
                <img
                  src={files.transparent ? URL.createObjectURL(files.transparent) : form.photoTransparentUrl}
                  alt="Vista previa del piloto"
                />
              ) : (
                <span>{form.name.slice(0, 2).toUpperCase() || "BB"}</span>
              )}
            </div>
            <div>
              <small>{selectedTeam?.name || "SIN ESCUDERÍA"}</small>
              <strong>{form.name || "Nuevo piloto"}</strong>
              <span>
                {form.drivingStyle === "Personalizado"
                  ? form.customDrivingStyle || "Personalizado"
                  : form.drivingStyle}
              </span>
            </div>
          </div>

          <button className={styles.saveButton} disabled={saving || !season}>
            {saving
              ? "GUARDANDO..."
              : editingId
                ? "GUARDAR CAMBIOS"
                : "CREAR PILOTO"}
          </button>

          {message && <div className={styles.message}>{message}</div>}
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kicker}>BASE ONLINE</span>
              <h2>Pilotos cargados</h2>
            </div>
            <strong className={styles.count}>{rows.length}</strong>
          </div>

          {loading && <p className={styles.empty}>Cargando...</p>}
          {!loading && rows.length === 0 && (
            <p className={styles.empty}>Todavía no hay pilotos.</p>
          )}

          <div className={styles.driverList}>
            {rows.map((row) => (
              <article
                className={`${styles.driverRow} ${row.active ? "" : styles.inactive}`}
                key={row.id}
                style={{
                  "--team-primary": row.team?.primary_color || "#555",
                  "--team-secondary": row.team?.secondary_color || "#fff",
                }}
              >
                <div className={styles.rowNumber}>#{row.assignment?.racing_number ?? "—"}</div>

                <div className={styles.rowTeamLogo}>
                  {row.team?.logo_url ? (
                    <img src={row.team.logo_url} alt={row.team.name} />
                  ) : (
                    <span>{(row.team?.name || "BB").slice(0, 2).toUpperCase()}</span>
                  )}
                </div>

                <div className={styles.rowPhoto}>
                  {row.photo_transparent_url ? (
                    <img src={row.photo_transparent_url} alt={row.name} />
                  ) : (
                    <span>{row.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>

                <div className={styles.driverInfo}>
                  <strong>{row.name}</strong>
                  <span>{row.custom_driving_style || row.driving_style}</span>
                </div>

                <div className={styles.rowActions}>
                  <button type="button" onClick={() => editDriver(row)}>Editar</button>
                  <button
                    type="button"
                    className={row.active ? styles.dangerButton : styles.activateButton}
                    onClick={() => toggleActive(row)}
                  >
                    {row.active ? "Desactivar" : "Activar"}
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
