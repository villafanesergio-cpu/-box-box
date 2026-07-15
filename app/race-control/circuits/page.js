"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import styles from "./circuits.module.css";

const EMPTY = {
  name: "",
  country: "",
  city: "",
  flag: "🏁",
  length_km: "",
  turns: "",
  active: true,
  track_image_url: "",
  cover_image_url: "",
};

function cleanFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

function TrackThumb({ circuit, large = false }) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(circuit.track_image_url) && !failed;

  return (
    <div className={`${styles.trackVisual} ${large ? styles.trackVisualLarge : ""}`}>
      <span className={styles.trackGlow} aria-hidden="true" />

      {hasImage ? (
        <img
          src={circuit.track_image_url}
          alt={`Trazado de ${circuit.name}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={styles.trackFallback}>
          <strong>{circuit.flag || "🏁"}</strong>
          <small>TRAZADO</small>
        </div>
      )}
    </div>
  );
}

export default function CircuitsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [circuits, setCircuits] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [trackFile, setTrackFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("Cargando circuitos...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCircuits();
  }, []);

  async function loadCircuits() {
    const { data, error } = await supabase
      .from("circuits")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    setCircuits(data ?? []);
    setMessage(data?.length ? "" : "Todavía no hay circuitos cargados.");
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function reset() {
    setForm(EMPTY);
    setTrackFile(null);
    setCoverFile(null);
    setEditingId(null);
    setMessage("");
  }

  function editCircuit(circuit) {
    setEditingId(circuit.id);
    setForm({
      name: circuit.name ?? "",
      country: circuit.country ?? "",
      city: circuit.city ?? "",
      flag: circuit.flag ?? "🏁",
      length_km: circuit.length_km ?? "",
      turns: circuit.turns ?? "",
      active: circuit.active,
      track_image_url: circuit.track_image_url ?? "",
      cover_image_url: circuit.cover_image_url ?? "",
    });
    setTrackFile(null);
    setCoverFile(null);
    setMessage(`Editando ${circuit.name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function upload(file, folder, fallback) {
    if (!file) return fallback || null;

    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const baseName = cleanFileName(
      file.name.replace(/\.[^/.]+$/, "") || folder
    );
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${extension}`;

    const { error } = await supabase.storage
      .from("circuit-media")
      .upload(path, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || undefined,
      });

    if (error) throw new Error(error.message);

    return supabase.storage
      .from("circuit-media")
      .getPublicUrl(path).data.publicUrl;
  }

  async function save(event) {
    event.preventDefault();

    if (!form.name.trim() || !form.country.trim()) {
      setMessage("Completá nombre y país.");
      return;
    }

    setSaving(true);
    setMessage(editingId ? "Guardando cambios..." : "Creando circuito...");

    try {
      const [trackUrl, coverUrl] = await Promise.all([
        upload(trackFile, "track", form.track_image_url),
        upload(coverFile, "cover", form.cover_image_url),
      ]);

      const payload = {
        name: form.name.trim(),
        country: form.country.trim(),
        city: form.city.trim() || null,
        flag: form.flag.trim() || "🏁",
        length_km: form.length_km ? Number(form.length_km) : null,
        turns: form.turns ? Number(form.turns) : null,
        active: form.active,
        track_image_url: trackUrl,
        cover_image_url: coverUrl,
      };

      const wasEditing = Boolean(editingId);
      const query = editingId
        ? supabase.from("circuits").update(payload).eq("id", editingId)
        : supabase.from("circuits").insert(payload);

      const { error } = await query;
      if (error) throw new Error(error.message);

      await loadCircuits();
      reset();
      setMessage(wasEditing ? "Circuito actualizado." : "Circuito creado.");
    } catch (error) {
      setMessage(`No se pudo guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(circuit) {
    const { error } = await supabase
      .from("circuits")
      .update({ active: !circuit.active })
      .eq("id", circuit.id);

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    await loadCircuits();
  }

  const previewCircuit = {
    name: form.name || "Nuevo circuito",
    flag: form.flag || "🏁",
    track_image_url: trackFile
      ? URL.createObjectURL(trackFile)
      : form.track_image_url,
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · RACE CONTROL</span>
          <h1>Circuitos</h1>
          <p>Alta, edición e imágenes del calendario.</p>
        </div>

        <div className={styles.actions}>
          <Link href="/race-control" className={styles.secondary}>
            Dashboard
          </Link>
          <Link href="/race-control/race" className={styles.primary}>
            Dirección de carrera
          </Link>
        </div>
      </header>

      <section className={styles.layout}>
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.cardHead}>
            <div>
              <span>{editingId ? "EDITAR" : "NUEVO"}</span>
              <h2>{editingId ? "Modificar circuito" : "Alta de circuito"}</h2>
            </div>

            {editingId && (
              <button type="button" onClick={reset}>
                Cancelar
              </button>
            )}
          </div>

          <div className={styles.two}>
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Suzuka"
                required
              />
            </label>

            <label>
              Bandera
              <input
                value={form.flag}
                onChange={(event) => update("flag", event.target.value)}
                placeholder="🇯🇵"
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              País
              <input
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                placeholder="Japón"
                required
              />
            </label>

            <label>
              Ciudad / sede
              <input
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
                placeholder="Suzuka"
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Longitud (km)
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.length_km}
                onChange={(event) => update("length_km", event.target.value)}
              />
            </label>

            <label>
              Curvas
              <input
                type="number"
                min="1"
                value={form.turns}
                onChange={(event) => update("turns", event.target.value)}
              />
            </label>
          </div>

          <label>
            Trazado
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={(event) =>
                setTrackFile(event.target.files?.[0] ?? null)
              }
            />
          </label>

          <label>
            Imagen de portada
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setCoverFile(event.target.files?.[0] ?? null)
              }
            />
          </label>

          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
            />
            Circuito activo
          </label>

          <div className={styles.preview}>
            <TrackThumb circuit={previewCircuit} large />

            <div>
              <small>{form.country || "PAÍS"}</small>
              <h3>{form.name || "Nuevo circuito"}</h3>
              <span>
                {form.length_km || "—"} km · {form.turns || "—"} curvas
              </span>
            </div>
          </div>

          <button className={styles.save} disabled={saving}>
            {saving
              ? "GUARDANDO..."
              : editingId
                ? "GUARDAR CAMBIOS"
                : "CREAR CIRCUITO"}
          </button>

          {message && <div className={styles.message}>{message}</div>}
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardHead}>
            <div>
              <span>BASE ONLINE</span>
              <h2>Circuitos cargados</h2>
            </div>
            <strong>{circuits.length}</strong>
          </div>

          <div className={styles.list}>
            {circuits.map((circuit) => (
              <article
                key={circuit.id}
                className={`${styles.row} ${
                  circuit.active ? "" : styles.inactive
                }`}
              >
                <TrackThumb circuit={circuit} />

                <div className={styles.circuitInfo}>
                  <strong>
                    <span className={styles.flag}>{circuit.flag}</span>
                    {circuit.name}
                  </strong>
                  <span>
                    {circuit.country}
                    {circuit.city ? ` · ${circuit.city}` : ""}
                  </span>
                  <small>
                    {circuit.length_km || "—"} km · {circuit.turns || "—"} curvas
                  </small>
                </div>

                <div className={styles.rowActions}>
                  <button type="button" onClick={() => editCircuit(circuit)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => toggle(circuit)}>
                    {circuit.active ? "Desactivar" : "Activar"}
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
