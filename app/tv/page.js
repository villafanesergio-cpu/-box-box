"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import styles from "./tv.module.css";

const displayNames = {
  Martin: "Martín",
  Alvaro: "Álvaro",
  Gonzalo: "Gonzalo Herrera",
  Lorenzo: "Loren",
  EZE: "Eze",
  DODI: "Dodi",
};

function driverName(name) {
  return displayNames[name] || name || "Piloto";
}

function compareCircuitRows(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.podiums !== a.podiums) return b.podiums - a.podiums;
  if (a.dnf !== b.dnf) return a.dnf - b.dnf;

  const maxPosition = Math.max(a.positions.length, b.positions.length);
  for (let index = 0; index < maxPosition; index += 1) {
    const aPosition = a.positions[index] ?? 999;
    const bPosition = b.positions[index] ?? 999;
    if (aPosition !== bPosition) return aPosition - bPosition;
  }

  return a.name.localeCompare(b.name, "es");
}

function calculateCircuitWinner(event) {
  const rows = new Map();

  for (const race of event.races ?? []) {
    for (const result of race.race_results ?? []) {
      const current = rows.get(result.driver_id) ?? {
        driverId: result.driver_id,
        points: 0,
        wins: 0,
        podiums: 0,
        dnf: 0,
        positions: [],
        name: result.driver_id,
      };

      current.points += Number(result.final_points ?? 0);
      if (result.status === "dnf") {
        current.dnf += 1;
      } else {
        const position = Number(result.finish_position ?? 999);
        current.positions.push(position);
        if (position === 1) current.wins += 1;
        if (position <= 3) current.podiums += 1;
      }
      rows.set(result.driver_id, current);
    }
  }

  return [...rows.values()].sort(compareCircuitRows)[0]?.driverId ?? null;
}

function buildWorldStandings(assignments, baselines, events) {
  const baselineMap = new Map((baselines ?? []).map((row) => [row.driver_id, row]));
  const rows = new Map();

  for (const assignment of assignments) {
    const baseline = baselineMap.get(assignment.driver.id);
    rows.set(assignment.driver.id, {
      driverId: assignment.driver.id,
      name: driverName(assignment.driver.name),
      number: assignment.racing_number,
      photo: assignment.driver.photo_transparent_url,
      teamName: assignment.team.name,
      teamLogo: assignment.team.logo_url,
      teamColor: assignment.team.primary_color || "#ed1c24",
      points: Number(baseline?.base_points ?? 0),
      wins: Number(baseline?.base_circuit_wins ?? 0),
      dnf: Number(baseline?.base_dnf ?? 0),
    });
  }

  const scoredEvents = (events ?? []).filter((event) =>
    (event.races ?? []).some((race) => (race.race_results ?? []).length > 0)
  );

  for (const event of scoredEvents) {
    const winnerId = calculateCircuitWinner(event);
    if (winnerId && rows.has(winnerId)) rows.get(winnerId).wins += 1;

    for (const race of event.races ?? []) {
      for (const result of race.race_results ?? []) {
        const row = rows.get(result.driver_id);
        if (!row) continue;
        row.points += Number(result.final_points ?? 0);
        if (result.status === "dnf") row.dnf += 1;
      }
    }
  }

  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.dnf !== b.dnf) return a.dnf - b.dnf;
    return a.name.localeCompare(b.name, "es");
  });
}

function DriverVisual({ row, large = false }) {
  return (
    <span className={`${styles.driverVisual} ${large ? styles.largeVisual : ""}`}>
      {row?.photo ? (
        <img className={styles.driverPhoto} src={row.photo} alt={row.name} />
      ) : (
        <b>{row?.name?.slice(0, 2).toUpperCase() || "—"}</b>
      )}
    </span>
  );
}

export default function TVPage() {
  const supabase = useMemo(() => createClient(), []);
  const [season, setSeason] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [event, setEvent] = useState(null);
  const [races, setRaces] = useState([]);
  const [worldStandings, setWorldStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Conectando con Race Control...");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [winnerOverlay, setWinnerOverlay] = useState(null);
  const previousRaceId = useRef(null);

  const loadTv = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);

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

    const [assignmentsResult, baselinesResult, finalizedResult, openEventResult] = await Promise.all([
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
      supabase
        .from("circuit_events")
        .select("id,name,status,round_number,event_date,started_at,finalized_at,circuit:circuits(id,name,country,city,flag,cover_image_url,track_image_url)")
        .eq("season_id", activeSeason.id)
        .eq("status", "open")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const error = assignmentsResult.error || baselinesResult.error || finalizedResult.error || openEventResult.error;
    if (error) {
      setMessage(`No se pudo cargar Modo TV: ${error.message}`);
      setLoading(false);
      return;
    }

    const activeAssignments = (assignmentsResult.data ?? []).filter(
      (assignment) => assignment.driver?.active && assignment.team?.active
    );

    let raceRows = [];
    const openEvent = openEventResult.data ?? null;

    if (openEvent) {
      const { data, error: raceError } = await supabase
        .from("races")
        .select(`
          id,race_number,status,started_at,finished_at,
          race_results(driver_id,status,final_points,finish_position),
          race_starters(driver_id,grid_position)
        `)
        .eq("event_id", openEvent.id)
        .order("race_number", { ascending: true });

      if (raceError) {
        setMessage(`No se pudieron cargar las carreras: ${raceError.message}`);
        setLoading(false);
        return;
      }
      raceRows = data ?? [];
    }

    setSeason(activeSeason);
    setAssignments(activeAssignments);
    setEvent(openEvent);
    setRaces(raceRows);
    setWorldStandings(buildWorldStandings(
      activeAssignments,
      baselinesResult.data ?? [],
      finalizedResult.data ?? []
    ));
    setLastUpdated(new Date());
    setMessage("");
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadTv();
    let refreshTimer = null;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => loadTv({ quiet: true }), 250);
    };

    const channel = supabase
      .channel("box-box-public-tv")
      .on("postgres_changes", { event: "*", schema: "public", table: "circuit_events" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "races" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "race_results" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "race_starters" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_participants" }, scheduleRefresh)
      .subscribe();

    const fallback = window.setInterval(() => loadTv({ quiet: true }), 12000);

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [loadTv, supabase]);

  const assignmentMap = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.driver.id, assignment])),
    [assignments]
  );

  const circuitStandings = useMemo(() => {
    const rows = new Map();

    for (const race of races) {
      const orderedResults = [...(race.race_results ?? [])].sort(
        (a, b) => Number(a.finish_position ?? 999) - Number(b.finish_position ?? 999)
      );

      for (const result of orderedResults) {
        const assignment = assignmentMap.get(result.driver_id);
        if (!assignment) continue;
        const current = rows.get(result.driver_id) ?? {
          driverId: result.driver_id,
          name: driverName(assignment.driver.name),
          number: assignment.racing_number,
          photo: assignment.driver.photo_transparent_url,
          teamName: assignment.team.name,
          teamLogo: assignment.team.logo_url,
          teamColor: assignment.team.primary_color || "#ed1c24",
          points: 0,
          wins: 0,
          podiums: 0,
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
          if (position <= 3) current.podiums += 1;
        }
        rows.set(result.driver_id, current);
      }
    }

    return [...rows.values()].sort(compareCircuitRows);
  }, [assignmentMap, races]);

  const lastRace = races.at(-1) ?? null;

  const lastResults = useMemo(() => {
    if (!lastRace) return [];
    return [...(lastRace.race_results ?? [])]
      .sort((a, b) => Number(a.finish_position ?? 999) - Number(b.finish_position ?? 999))
      .map((result) => {
        const assignment = assignmentMap.get(result.driver_id);
        return {
          ...result,
          name: driverName(assignment?.driver?.name),
          photo: assignment?.driver?.photo_transparent_url,
          teamLogo: assignment?.team?.logo_url,
          teamName: assignment?.team?.name,
        };
      });
  }, [assignmentMap, lastRace]);

  const nextGrid = useMemo(() => [...lastResults].reverse(), [lastResults]);

  useEffect(() => {
    const currentRaceId = lastRace?.id ?? null;
    if (currentRaceId && previousRaceId.current && previousRaceId.current !== currentRaceId) {
      const winner = lastResults.find((result) => result.status !== "dnf");
      if (winner) {
        setWinnerOverlay({ ...winner, raceNumber: lastRace.race_number });
        const timer = window.setTimeout(() => setWinnerOverlay(null), 6500);
        previousRaceId.current = currentRaceId;
        return () => window.clearTimeout(timer);
      }
    }
    previousRaceId.current = currentRaceId;
  }, [lastRace, lastResults]);

  const requestFullscreen = () => document.documentElement.requestFullscreen?.();

  const liveComment = event
    ? circuitStandings.length
      ? `${circuitStandings[0].name} lidera ${event.circuit?.name} con ${circuitStandings[0].points} puntos.`
      : `El GP de ${event.circuit?.name} está abierto. Esperando la primera carrera.`
    : "No hay un circuito abierto. La pantalla se actualizará automáticamente cuando comience la próxima jornada.";

  return (
    <main className={styles.page}>
      {winnerOverlay && (
        <section className={styles.winnerOverlay}>
          <DriverVisual row={winnerOverlay} large />
          <span>CARRERA {winnerOverlay.raceNumber}</span>
          <h2>VICTORIA</h2>
          <strong>{winnerOverlay.name}</strong>
          <small>+{winnerOverlay.final_points} PTS</small>
        </section>
      )}

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <img src="/box-box-logo.png" alt="BOX BOX" />
          <div><strong>BOX BOX</strong><span>{season?.name || "Mundial 2026"}</span></div>
        </Link>

        <div className={styles.liveStatus}>
          <span className={event ? styles.liveDot : styles.waitDot} />
          <div>
            <small>{event ? "EN VIVO" : "EN ESPERA"}</small>
            <strong>{event?.circuit?.name || "PRÓXIMO CIRCUITO"}</strong>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button type="button" onClick={() => loadTv({ quiet: true })}>ACTUALIZAR</button>
          <button type="button" onClick={requestFullscreen}>⛶</button>
        </div>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.eventHero} style={event?.circuit?.cover_image_url ? { backgroundImage: `linear-gradient(90deg,rgba(5,5,8,.97),rgba(5,5,8,.45)),url(${event.circuit.cover_image_url})` } : undefined}>
        <div>
          <span>{event ? `FECHA ${event.round_number || "—"} · CIRCUITO ABIERTO` : "MODO TV PÚBLICO"}</span>
          <h1>{event ? `${event.circuit?.flag || "🏁"} ${event.circuit?.name}` : "ESPERANDO LARGADA"}</h1>
          <p>{event ? `${event.circuit?.country || ""}${event.event_date ? ` · ${new Date(`${event.event_date}T12:00:00`).toLocaleDateString("es-AR")}` : ""} · ${races.length} carrera${races.length === 1 ? "" : "s"} cargada${races.length === 1 ? "" : "s"}` : "Cualquier persona puede abrir esta pantalla. Los resultados aparecen automáticamente desde Race Control."}</p>
        </div>
        <div className={styles.eventMetric}>
          <small>ÚLTIMA ACTUALIZACIÓN</small>
          <strong>{lastUpdated ? lastUpdated.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <section className={styles.board}>
          <div className={styles.sectionHead}>
            <div>
              <span>{event ? "CLASIFICACIÓN DEL CIRCUITO" : "CAMPEONATO MUNDIAL"}</span>
              <h2>{event ? (races.length ? `Después de Carrera ${races.length}` : "Sin resultados") : "Mundial 2026"}</h2>
            </div>
            <strong>{event ? circuitStandings.length : worldStandings.length} PILOTOS</strong>
          </div>

          <div className={styles.tableHead}>
            <span>POS</span><span>ESC.</span><span>PILOTO</span><span>DATOS</span><span>PTS</span>
          </div>

          <div className={styles.table}>
            {(event ? circuitStandings : worldStandings).map((row, index) => (
              <article className={`${styles.row} ${index === 0 ? styles.leader : ""}`} key={row.driverId} style={{ "--team": row.teamColor }}>
                <b>{index + 1}</b>
                <img className={styles.rowTeamLogo} src={row.teamLogo || ""} alt="" />
                <DriverVisual row={row} />
                <div className={styles.rowName}>
                  <strong>{row.name}</strong>
                  <span>#{row.number} · {row.teamName}</span>
                </div>
                <div className={styles.rowStats}>
                  {event ? <><span>{row.wins} V</span><span>{row.podiums} P</span><span>{row.dnf} DNF</span></> : <><span>{row.wins} GP</span><span>{row.dnf} DNF</span></>}
                </div>
                <em>{row.points}</em>
              </article>
            ))}
            {!loading && !(event ? circuitStandings : worldStandings).length && <div className={styles.empty}>Esperando datos de la competición.</div>}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.dataCard}>
            <span>BOX BOX DATA</span>
            <p>{liveComment}</p>
            <i />
          </section>

          <section className={styles.sideCard}>
            <div className={styles.cardHead}><span>PRÓXIMA PARRILLA</span><small>INVERTIDA</small></div>
            <div className={styles.miniGrid}>
              {nextGrid.slice(0, 10).map((row, index) => (
                <div key={row.driver_id}><b>{index + 1}</b><img src={row.teamLogo || ""} alt="" /><span>{row.name}</span></div>
              ))}
              {!nextGrid.length && <p>Se completa después de guardar la primera carrera.</p>}
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.cardHead}><span>MUNDIAL</span><small>TOP 5</small></div>
            <div className={styles.worldList}>
              {worldStandings.slice(0, 5).map((row, index) => (
                <div key={row.driverId}><b>{index + 1}</b><img className={styles.worldTeamLogo} src={row.teamLogo || ""} alt="" /><DriverVisual row={row} /><span>{row.name}</span><strong>{row.points}</strong></div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerHead}><span>RESULTADO ÚLTIMA CARRERA</span><small>{lastRace ? `CARRERA ${lastRace.race_number}` : "SIN CARRERAS"}</small></div>
        <div className={styles.lastStrip}>
          {lastResults.length ? lastResults.map((row) => (
            <article className={row.status === "dnf" ? styles.dnf : ""} key={row.driver_id}>
              <b>{row.status === "dnf" ? "DNF" : row.finish_position}</b>
              <img src={row.teamLogo || ""} alt="" />
              <span>{row.name}</span>
              <strong>{row.final_points}</strong>
            </article>
          )) : <p>La pantalla se actualizará cuando Race Control guarde una carrera.</p>}
        </div>
      </footer>
    </main>
  );
}
