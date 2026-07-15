"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { getBoxBoxSetup } from "../../lib/supabase/queries";
import styles from "./data-check.module.css";

export default function DataCheckPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState({
    season: null,
    teams: [],
    drivers: [],
  });
  const [status, setStatus] = useState("Cargando datos reales...");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getBoxBoxSetup(supabase);
        if (!mounted) return;
        setData(result);
        setStatus("Datos cargados correctamente desde Supabase.");
      } catch (error) {
        if (!mounted) return;
        setStatus(`Error: ${error.message}`);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · PRUEBA DE DATOS</span>
          <h1>Supabase conectado</h1>
          <p>{status}</p>
        </div>
        <Link href="/" className={styles.back}>Volver</Link>
      </header>

      <section className={styles.metrics}>
        <article>
          <small>TEMPORADA ACTIVA</small>
          <strong>{data.season?.name || "Sin temporada"}</strong>
        </article>
        <article>
          <small>ESCUDERÍAS ACTIVAS</small>
          <strong>{data.teams.length}</strong>
        </article>
        <article>
          <small>PILOTOS ACTIVOS</small>
          <strong>{data.drivers.length}</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <span>PARRILLA REAL</span>
            <h2>Pilotos cargados</h2>
          </div>
          <strong>{data.drivers.length}</strong>
        </div>

        <div className={styles.grid}>
          {data.drivers.map((driver) => (
            <article
              className={styles.driver}
              key={driver.driverId}
              style={{
                "--team-primary": driver.teamPrimaryColor || "#e10600",
                "--team-secondary": driver.teamSecondaryColor || "#ffffff",
              }}
            >
              <div className={styles.number}>#{driver.number}</div>

              <div className={styles.logo}>
                {driver.teamLogoUrl ? (
                  <img src={driver.teamLogoUrl} alt={driver.teamName} />
                ) : (
                  <span>{driver.teamName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className={styles.photo}>
                {driver.photoTransparentUrl ? (
                  <img src={driver.photoTransparentUrl} alt={driver.name} />
                ) : (
                  <span>{driver.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className={styles.info}>
                <strong>{driver.name}</strong>
                <span>{driver.drivingStyle}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
