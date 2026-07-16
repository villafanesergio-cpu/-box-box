"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import styles from "./appearance.module.css";

function safeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

export default function AppearancePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [heroImages, setHeroImages] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [heroTitle, setHeroTitle] = useState("");
  const [heroFile, setHeroFile] = useState(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorWebsite, setSponsorWebsite] = useState("");
  const [sponsorFile, setSponsorFile] = useState(null);
  const [message, setMessage] = useState("Cargando apariencia...");
  const [saving, setSaving] = useState(false);

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
    const [heroResult, sponsorResult] = await Promise.all([
      supabase
        .from("site_hero_images")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("sponsors")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const error = heroResult.error || sponsorResult.error;
    if (error) {
      setMessage(`No se pudo cargar: ${error.message}`);
      return;
    }

    setHeroImages(heroResult.data ?? []);
    setSponsors(sponsorResult.data ?? []);
    setMessage("");
  }

  async function uploadMedia(file, folder) {
    if (!file) throw new Error("Elegí un archivo.");

    const extension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : "webp";
    const base = safeFileName(file.name.replace(/\.[^/.]+$/, "") || folder);
    const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;

    const { error } = await supabase.storage
      .from("site-media")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (error) throw new Error(error.message);
    return supabase.storage.from("site-media").getPublicUrl(storagePath).data.publicUrl;
  }

  async function saveHero(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!heroFile) {
      setMessage("Elegí una imagen de fondo.");
      return;
    }

    setSaving(true);
    setMessage("Subiendo fondo...");

    try {
      const imageUrl = await uploadMedia(heroFile, "hero");
      const { error } = await supabase.from("site_hero_images").insert({
        title: heroTitle.trim() || `Fondo ${heroImages.length + 1}`,
        image_url: imageUrl,
        active: true,
        sort_order: heroImages.length,
      });
      if (error) throw new Error(error.message);

      setHeroTitle("");
      setHeroFile(null);
      formElement.reset();
      await loadAll();
      setMessage("Fondo agregado a la rotación.");
    } catch (error) {
      setMessage(`No se pudo guardar el fondo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveSponsor(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!sponsorName.trim() || !sponsorFile) {
      setMessage("Completá el nombre y elegí el logo.");
      return;
    }

    setSaving(true);
    setMessage("Subiendo sponsor...");

    try {
      const logoUrl = await uploadMedia(sponsorFile, "sponsors");
      const { error } = await supabase.from("sponsors").insert({
        name: sponsorName.trim(),
        logo_url: logoUrl,
        website_url: sponsorWebsite.trim() || null,
        active: true,
        sort_order: sponsors.length,
      });
      if (error) throw new Error(error.message);

      setSponsorName("");
      setSponsorWebsite("");
      setSponsorFile(null);
      formElement.reset();
      await loadAll();
      setMessage("Sponsor agregado a la barra.");
    } catch (error) {
      setMessage(`No se pudo guardar el sponsor: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleHero(row) {
    const { error } = await supabase
      .from("site_hero_images")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
  }

  async function toggleSponsor(row) {
    const { error } = await supabase
      .from("sponsors")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
  }

  async function deleteHero(row) {
    if (!window.confirm(`¿Eliminar el fondo “${row.title}”?`)) return;
    const { error } = await supabase.from("site_hero_images").delete().eq("id", row.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
    setMessage("Fondo eliminado.");
  }

  async function deleteSponsor(row) {
    if (!window.confirm(`¿Eliminar el sponsor “${row.name}”?`)) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", row.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAll();
    setMessage("Sponsor eliminado.");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · RACE CONTROL</span>
          <h1>Apariencia y sponsors</h1>
          <p>Administrá los fondos de portada y la barra pública de marcas.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/race-control">Race Control</Link>
          <Link href="/">Ver portada</Link>
        </div>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.forms}>
        <form className={styles.formCard} onSubmit={saveHero}>
          <div>
            <span>PORTADA</span>
            <h2>Nuevo fondo</h2>
            <p>Las imágenes activas rotan automáticamente cada nueve segundos.</p>
          </div>

          <label>
            Nombre interno
            <input
              value={heroTitle}
              onChange={(event) => setHeroTitle(event.target.value)}
              placeholder="Ej.: Parrilla nocturna"
            />
          </label>

          <label>
            Imagen de fondo · JPG, PNG, WebP o GIF
            <input
              required
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => setHeroFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {heroFile && <img className={styles.preview} src={URL.createObjectURL(heroFile)} alt="Vista previa" />}

          <button disabled={saving}>AGREGAR FONDO</button>
        </form>

        <form className={styles.formCard} onSubmit={saveSponsor}>
          <div>
            <span>PARTNERS</span>
            <h2>Nuevo sponsor</h2>
            <p>El logo aparecerá en la barra animada superior.</p>
          </div>

          <label>
            Nombre
            <input
              required
              value={sponsorName}
              onChange={(event) => setSponsorName(event.target.value)}
              placeholder="Ej.: Fanatec"
            />
          </label>

          <label>
            Sitio web opcional
            <input
              value={sponsorWebsite}
              onChange={(event) => setSponsorWebsite(event.target.value)}
              placeholder="https://..."
            />
          </label>

          <label>
            Logo · JPG, PNG, WebP, GIF o SVG
            <input
              required
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              onChange={(event) => setSponsorFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {sponsorFile && <img className={styles.logoPreview} src={URL.createObjectURL(sponsorFile)} alt="Vista previa" />}

          <button disabled={saving}>AGREGAR SPONSOR</button>
        </form>
      </section>

      <section className={styles.contentGrid}>
        <section className={styles.listCard}>
          <div className={styles.cardHead}>
            <div><span>ROTACIÓN</span><h2>Fondos cargados</h2></div>
            <strong>{heroImages.length}</strong>
          </div>

          <div className={styles.heroList}>
            {heroImages.map((row) => (
              <article className={row.active ? "" : styles.inactive} key={row.id}>
                <img src={row.image_url} alt={row.title} />
                <div><strong>{row.title}</strong><small>{row.active ? "ACTIVO" : "PAUSADO"}</small></div>
                <button type="button" onClick={() => toggleHero(row)}>{row.active ? "Pausar" : "Activar"}</button>
                <button type="button" className={styles.danger} onClick={() => deleteHero(row)}>Eliminar</button>
              </article>
            ))}
            {!heroImages.length && <p className={styles.empty}>Todavía no cargaste fondos.</p>}
          </div>
        </section>

        <section className={styles.listCard}>
          <div className={styles.cardHead}>
            <div><span>MARQUESINA</span><h2>Sponsors cargados</h2></div>
            <strong>{sponsors.length}</strong>
          </div>

          <div className={styles.sponsorList}>
            {sponsors.map((row) => (
              <article className={row.active ? "" : styles.inactive} key={row.id}>
                <img src={row.logo_url} alt={row.name} />
                <div><strong>{row.name}</strong><small>{row.active ? "ACTIVO" : "PAUSADO"}</small></div>
                <button type="button" onClick={() => toggleSponsor(row)}>{row.active ? "Pausar" : "Activar"}</button>
                <button type="button" className={styles.danger} onClick={() => deleteSponsor(row)}>Eliminar</button>
              </article>
            ))}
            {!sponsors.length && <p className={styles.empty}>Todavía no cargaste sponsors.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
