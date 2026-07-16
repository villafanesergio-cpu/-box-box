"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import styles from "./standings.module.css";

function compareCircuitRows(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;

  const maxPosition = Math.max(a.positions.length, b.positions.length);
  for (let index = 0; index < maxPosition; index += 1) {
    const aPosition = a.positions[index] ?? 999;
    const bPosition = b.positions[index] ?? 999;
    if (aPosition !== bPosition) return aPosition - bPosition;
  }

  if (a.dnf !== b.dnf) return a.dnf - b.dnf;
  return a.driverId.localeCompare(b.driverId);
}

function calculateCircuitWinner(event) {
  const rows = new Map();

  for (const race of event.races ?? []) {
    for (const result of race.race_results ?? []) {
      const current = rows.get(result.driver_id) ?? {
        driverId: result.driver_id,
        points: 0,
        wins: 0,
        dnf: 0,
        positions: [],
      };

      current.points += Number(result.final_points ?? 0);

      if (result.status === "dnf") {
        current.dnf += 1;
      } else {
        const position = Number(result.finish_position ?? 999);
        current.positions.push(position);
        if (position === 1) current.wins += 1;
      }

      rows.set(result.driver_id, current);
    }
  }

  return [...rows.values()].sort(compareCircuitRows)[0]?.driverId ?? null;
}

export default function StandingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [season, setSeason] = useState(null);
  const [standings, setStandings] = useState([]);
  const [finalizedCircuits, setFinalizedCircuits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Cargando clasificación...");

  useEffect(() => {
    loadStandings();
  }, []);

  async function loadStandings() {
    setLoading(true);

    const { data: activeSeason, error: seasonError } = await supabase
      .from("seasons")
      .select("id,name,year")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (seasonError || !activeSeason) {
      setMessage(seasonError?.message || "No hay una temporada activa.");
      setLoading(false);
      return;
    }

    setSeason(activeSeason);

    const [assignmentsResult, baselinesResult, eventsResult] = await Promise.all([
      supabase
        .from("season_driver_teams")
        .select(`
          id,racing_number,active,
          driver:drivers(id,name,photo_transparent_url,active),
          team:teams(id,name,logo_url,primary_color,secondary_color,active)
        `)
        .eq("season_id", activeSeason.id)
        .eq("active", true)
        .order("racing_number", { ascending: true }),
      supabase
        .from("season_driver_baselines")
        .select("driver_id,base_points,base_circuit_wins,base_dnf")
        .eq("season_id", activeSeason.id),
      supabase
        .from("circuit_events")
        .select(`
          id,status,finalized_at,
          races(
            id,race_number,
            race_results(driver_id,status,final_points,finish_position)
          )
        `)
        .eq("season_id", activeSeason.id)
        .eq("status", "finalized"),
    ]);

    const error = assignmentsResult.error || baselinesResult.error || eventsResult.error;

    if (error) {
      setMessage(`No se pudo cargar la clasificación: ${error.message}`);
      setLoading(false);
      return;
    }

    const assignments = (assignmentsResult.data ?? []).filter(
      (assignment) => assignment.driver?.active && assignment.team?.active
    );
    const baselines = new Map(
      (baselinesResult.data ?? []).map((row) => [row.driver_id, row])
    );
    const finalizedEvents = eventsResult.data ?? [];
    const scoredEvents = finalizedEvents.filter((event) =>
      (event.races ?? []).some((race) => (race.race_results ?? []).length > 0)
    );

    const calculated = new Map();

    for (const assignment of assignments) {
      const baseline = baselines.get(assignment.driver.id);
      calculated.set(assignment.driver.id, {
        driverId: assignment.driver.id,
        name: assignment.driver.name,
        number: assignment.racing_number,
        photo: assignment.driver.photo_transparent_url,
        teamName: assignment.team.name,
        teamLogo: assignment.team.logo_url,
        primaryColor: assignment.team.primary_color || "#e10600",
        basePoints: Number(baseline?.base_points ?? 0),
        appPoints: 0,
        baseWins: Number(baseline?.base_circuit_wins ?? 0),
        appWins: 0,
        baseDnf: Number(baseline?.base_dnf ?? 0),
        appDnf: 0,
      });
    }

    for (const event of scoredEvents) {
      const circuitWinnerId = calculateCircuitWinner(event);
      if (circuitWinnerId && calculated.has(circuitWinnerId)) {
        calculated.get(circuitWinnerId).appWins += 1;
      }

      for (const race of event.races ?? []) {
        for (const result of race.race_results ?? []) {
          const row = calculated.get(result.driver_id);
          if (!row) continue;

          row.appPoints += Number(result.final_points ?? 0);
          if (result.status === "dnf") row.appDnf += 1;
        }
      }
    }

    const rows = [...calculated.values()]
      .map((row) => ({
        ...row,
        points: row.basePoints + row.appPoints,
        wins: row.baseWins + row.appWins,
        dnf: row.baseDnf + row.appDnf,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.dnf !== b.dnf) return a.dnf - b.dnf;
        return a.name.localeCompare(b.name, "es");
      });

    setStandings(rows);
    setFinalizedCircuits(scoredEvents.length);
    setMessage("");
    setLoading(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · MUNDIAL</span>
          <h1>Clasificación</h1>
          <p>
            {season?.name || "Temporada activa"} · Base histórica más resultados cargados
          </p>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={loadStandings}>ACTUALIZAR</button>
          <Link href="/race-control">RACE CONTROL</Link>
        </div>
      </header>

      <section className={styles.summary}>
        <article>
          <span>PILOTOS</span>
          <strong>{standings.length}</strong>
        </article>
        <article>
          <span>CIRCUITOS CON RESULTADOS</span>
          <strong>{finalizedCircuits}</strong>
        </article>
        <article>
          <span>LÍDER</span>
          <strong>{standings[0]?.name || "—"}</strong>
        </article>
        <article>
          <span>PUNTOS DEL LÍDER</span>
          <strong>{standings[0]?.points ?? 0}</strong>
        </article>
      </section>

      {message && <div className={styles.message}>{message}</div>}

      {!loading && !message && (
        <section className={styles.table}>
          <div className={styles.tableHead}>
            <span>POS.</span>
            <span>PILOTO</span>
            <span>VICTORIAS</span>
            <span>DNF</span>
            <span>PUNTOS</span>
          </div>

          {standings.map((row, index) => (
            <article
              className={`${styles.row} ${index < 3 ? styles[`top${index + 1}`] : ""}`}
              key={row.driverId}
              style={{ "--team-color": row.primaryColor }}
            >
              <div className={styles.position}>{index + 1}</div>

              <div className={styles.driver}>
                <div className={styles.visual}>
                  {row.teamLogo && <img src={row.teamLogo} alt="" />}
                  {row.photo && <img src={row.photo} alt={row.name} />}
                </div>
                <div>
                  <small>#{row.number} · {row.teamName}</small>
                  <strong>{row.name}</strong>
                  <span>Campeonato 2026</span>
                </div>
              </div>

              <div className={styles.stat}>
                <strong>{row.wins}</strong>
                <small>GP</small>
              </div>

              <div className={styles.stat}>
                <strong>{row.dnf}</strong>
                <small>ABANDONOS</small>
              </div>

              <div className={styles.points}>
                <strong>{row.points}</strong>
                <small>PTS</small>
              </div>
            </article>
          ))}
        </section>
      )}

      <footer className={styles.footer}>
        Los resultados nuevos se suman al finalizar cada circuito.
      </footer>
    </main>
  );
}
