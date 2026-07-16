"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import styles from "./seasons.module.css";

const currentYear = new Date().getFullYear();

export default function SeasonsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [seasons, setSeasons] = useState([]);
  const [assignmentCounts, setAssignmentCounts] = useState(new Map());
  const [eventCounts, setEventCounts] = useState(new Map());
  const [name, setName] = useState(`Mundial ${currentYear + 1}`);
  const [year, setYear] = useState(currentYear + 1);
  const [copyDrivers, setCopyDrivers] = useState(true);
  const [activateAfterCreate, setActivateAfterCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingYear, setEditingYear] = useState("");
  const [message, setMessage] = useState("Cargando temporadas...");
  const [saving, setSaving] = useState(false);

  const activeSeason = useMemo(
    () => seasons.find((season) => season.active) ?? null,
    [seasons]
  );

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace("/login");
        return;
      }

      if (mounted) await loadAll();
    }

    boot();
    return () => { mounted = false; };
  }, [router, supabase]);

  async function loadAll() {
    const [seasonsResult, assignmentsResult, eventsResult] = await Promise.all([
      supabase
        .from("seasons")
        .select("id,name,year,active,created_at")
        .order("year", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("season_driver_teams")
        .select("season_id")
        .eq("active", true),
      supabase
        .from("circuit_events")
        .select("season_id"),
    ]);

    const error = seasonsResult.error || assignmentsResult.error || eventsResult.error;
    if (error) {
      setMessage(`No se pudieron cargar las temporadas: ${error.message}`);
      return;
    }

    const assignments = new Map();
    for (const row of assignmentsResult.data ?? []) {
      assignments.set(row.season_id, (assignments.get(row.season_id) ?? 0) + 1);
    }

    const events = new Map();
    for (const row of eventsResult.data ?? []) {
      events.set(row.season_id, (events.get(row.season_id) ?? 0) + 1);
    }

    setSeasons(seasonsResult.data ?? []);
    setAssignmentCounts(assignments);
    setEventCounts(events);
    setMessage("");
  }

  async function createSeason(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const numericYear = Number(year);

    if (!cleanName || !Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
      setMessage("Completá un nombre y un año válido.");
      return;
    }

    setSaving(true);
    setMessage("Creando temporada...");

    const { error } = await supabase.rpc("create_boxbox_season", {
      p_name: cleanName,
      p_year: numericYear,
      p_copy_from: copyDrivers ? activeSeason?.id ?? null : null,
      p_activate: activateAfterCreate,
    });

    if (error) {
      setMessage(`No se pudo crear la temporada: ${error.message}`);
      setSaving(false);
      return;
    }

    setName(`Mundial ${numericYear + 1}`);
    setYear(numericYear + 1);
    setActivateAfterCreate(false);
    await loadAll();
    setMessage(
      activateAfterCreate
        ? "Temporada creada y activada."
        : "Temporada creada. Podés activarla cuando corresponda."
    );
    setSaving(false);
  }

  async function activateSeason(season) {
    if (season.active) return;

    const confirmed = window.confirm(
      `¿Activar ${season.name}? La temporada actual quedará guardada como histórica.`
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage(`Activando ${season.name}...`);

    const { error } = await supabase.rpc("activate_boxbox_season", {
      p_season_id: season.id,
    });

    if (error) {
      setMessage(`No se pudo activar: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadAll();
    setMessage(`${season.name} es ahora la temporada activa.`);
    setSaving(false);
  }

  function startEdit(season) {
    setEditingId(season.id);
    setEditingName(season.name);
    setEditingYear(season.year.toString());
    setMessage(`Editando ${season.name}.`);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingYear("");
    setMessage("");
  }

  async function saveEdit(season) {
    const cleanName = editingName.trim();
    const numericYear = Number(editingYear);

    if (!cleanName || !Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
      setMessage("Completá un nombre y un año válido.");
      return;
    }

    setSaving(true);
    setMessage("Guardando cambios...");

    const { error } = await supabase
      .from("seasons")
      .update({ name: cleanName, year: numericYear })
      .eq("id", season.id);

    if (error) {
      setMessage(`No se pudo editar: ${error.message}`);
      setSaving(false);
      return;
    }

    cancelEdit();
    await loadAll();
    setMessage("Temporada actualizada.");
    setSaving(false);
  }

  async function deleteSeason(season) {
    const events = eventCounts.get(season.id) ?? 0;

    if (season.active) {
      setMessage("No se puede eliminar la temporada activa.");
      return;
    }

    if (events > 0) {
      setMessage("No se puede eliminar una temporada que ya tiene fechas guardadas.");
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar ${season.name}? También se quitarán sus asignaciones de pilotos.`
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage(`Eliminando ${season.name}...`);

    const { error } = await supabase.rpc("delete_empty_boxbox_season", {
      p_season_id: season.id,
    });

    if (error) {
      setMessage(`No se pudo eliminar: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadAll();
    setMessage("Temporada eliminada.");
    setSaving(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · RACE CONTROL</span>
          <h1>Temporadas</h1>
          <p>Creá nuevos mundiales y conservá todo el historial anterior.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/race-control">Race Control</Link>
          <Link href="/">Ver portada</Link>
        </div>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.layout}>
        <form className={styles.formCard} onSubmit={createSeason}>
          <div>
            <span>NUEVO CAMPEONATO</span>
            <h2>Crear temporada</h2>
            <p>La temporada actual no se borra: queda disponible como historial.</p>
          </div>

          <label>
            Nombre
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej.: Mundial 2027"
            />
          </label>

          <label>
            Año
            <input
              required
              type="number"
              min="2000"
              max="2200"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={copyDrivers}
              onChange={(event) => setCopyDrivers(event.target.checked)}
            />
            <span>
              <strong>Copiar pilotos y escuderías</strong>
              <small>
                {activeSeason
                  ? `Usar la configuración de ${activeSeason.name}.`
                  : "No hay una temporada activa para copiar."}
              </small>
            </span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={activateAfterCreate}
              onChange={(event) => setActivateAfterCreate(event.target.checked)}
            />
            <span>
              <strong>Activar inmediatamente</strong>
              <small>La temporada actual quedará guardada como histórica.</small>
            </span>
          </label>

          <button disabled={saving}>CREAR TEMPORADA</button>
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardHead}>
            <div>
              <span>HISTORIAL</span>
              <h2>Temporadas cargadas</h2>
            </div>
            <strong>{seasons.length}</strong>
          </div>

          <div className={styles.seasonList}>
            {seasons.map((season) => {
              const drivers = assignmentCounts.get(season.id) ?? 0;
              const events = eventCounts.get(season.id) ?? 0;
              const editing = editingId === season.id;

              return (
                <article
                  className={`${styles.seasonRow} ${season.active ? styles.activeSeason : ""}`}
                  key={season.id}
                >
                  <div className={styles.year}>{season.year}</div>

                  <div className={styles.seasonInfo}>
                    {editing ? (
                      <div className={styles.editGrid}>
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                        />
                        <input
                          type="number"
                          min="2000"
                          max="2200"
                          value={editingYear}
                          onChange={(event) => setEditingYear(event.target.value)}
                        />
                      </div>
                    ) : (
                      <>
                        <span>{season.active ? "TEMPORADA ACTIVA" : "HISTÓRICA"}</span>
                        <strong>{season.name}</strong>
                        <small>{drivers} pilotos · {events} fechas guardadas</small>
                      </>
                    )}
                  </div>

                  <div className={styles.rowActions}>
                    {editing ? (
                      <>
                        <button type="button" onClick={() => saveEdit(season)}>Guardar</button>
                        <button type="button" onClick={cancelEdit}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        {!season.active && (
                          <button
                            type="button"
                            className={styles.activate}
                            onClick={() => activateSeason(season)}
                          >
                            Activar
                          </button>
                        )}
                        <button type="button" onClick={() => startEdit(season)}>Editar</button>
                        {!season.active && events === 0 && (
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => deleteSeason(season)}
                          >
                            Eliminar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}

            {!seasons.length && <p className={styles.empty}>Todavía no hay temporadas.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
