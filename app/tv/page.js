"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pilotos } from "../../lib/boxbox-data";
import {
  LIVE_CHANNEL,
  STORAGE_KEY,
  calculateCircuitStandings,
  calculateWorldStandings,
  getLiveComments,
  nextGridFromRace
} from "../../lib/race-utils";

function DriverAvatar({ pilot, className = "" }) {
  const initials = pilot?.iniciales || pilot?.nombre?.slice(0, 2).toUpperCase() || "—";
  return (
    <span className={`tv-driver-avatar ${className}`.trim()} aria-label={pilot?.nombre || "Piloto"}>
      <span>{initials}</span>
      {pilot?.foto && (
        <img
          src={pilot.foto}
          alt={pilot.nombre}
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      )}
    </span>
  );
}

export default function TVPage() {
  const [raceState, setRaceState] = useState({ sessions: [], activeSessionId: null });
  const [ready, setReady] = useState(false);
  const [commentIndex, setCommentIndex] = useState(0);
  const [winnerOverlay, setWinnerOverlay] = useState(null);
  const previousRaceId = useRef(null);

  useEffect(() => {
    const readStorage = () => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setRaceState(JSON.parse(saved));
      } catch (error) {
        console.error("No se pudo leer el estado de BOX BOX", error);
      } finally {
        setReady(true);
      }
    };

    readStorage();
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY && event.newValue) setRaceState(JSON.parse(event.newValue));
    };
    window.addEventListener("storage", onStorage);

    let channel;
    try {
      channel = new BroadcastChannel(LIVE_CHANNEL);
      channel.onmessage = (event) => setRaceState(event.data);
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);

  const activeSession = useMemo(
    () => raceState.sessions.find((session) => session.id === raceState.activeSessionId) || null,
    [raceState]
  );
  const standings = useMemo(() => calculateCircuitStandings(activeSession?.races || []), [activeSession]);
  const worldStandings = useMemo(() => calculateWorldStandings(pilotos, raceState.sessions), [raceState.sessions]);
  const lastRace = activeSession?.races?.at(-1) || null;
  const nextGrid = useMemo(() => nextGridFromRace(lastRace), [lastRace]);
  const comments = useMemo(() => getLiveComments(activeSession, standings), [activeSession, standings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCommentIndex((index) => comments.length ? (index + 1) % comments.length : 0);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [comments.length]);

  useEffect(() => {
    const currentRaceId = lastRace?.id || null;
    if (currentRaceId && previousRaceId.current && previousRaceId.current !== currentRaceId) {
      const winner = lastRace.results.find((result) => result.status !== "dnf");
      if (winner) {
        setWinnerOverlay({ driver: winner.driver, raceNumber: lastRace.number, points: winner.points });
        const timer = window.setTimeout(() => setWinnerOverlay(null), 5500);
        previousRaceId.current = currentRaceId;
        return () => window.clearTimeout(timer);
      }
    }
    previousRaceId.current = currentRaceId;
  }, [lastRace]);

  const requestFullscreen = () => document.documentElement.requestFullscreen?.();

  if (!ready) return <main className="tv-shell tv-waiting">Cargando BOX BOX…</main>;

  if (!activeSession) {
    return (
      <main className="tv-shell tv-waiting">
        <img src="/box-box-logo.png" alt="BOX BOX" />
        <span>RACE CONTROL</span>
        <h1>ESPERANDO CIRCUITO</h1>
        <p>Abrí Modo Carrera desde el celular e iniciá una jornada.</p>
        <button type="button" onClick={requestFullscreen}>Pantalla completa</button>
      </main>
    );
  }

  return (
    <main className="tv-shell">
      {winnerOverlay && (
        <div className="winner-overlay">
          <DriverAvatar
            pilot={pilotos.find((pilot) => pilot.nombre === winnerOverlay.driver) || { nombre: winnerOverlay.driver, iniciales: winnerOverlay.driver.slice(0, 2) }}
            className="winner-photo"
          />
          <span>CARRERA {winnerOverlay.raceNumber}</span>
          <h2>VICTORIA</h2>
          <strong>{winnerOverlay.driver}</strong>
          <small>+{winnerOverlay.points} PTS</small>
        </div>
      )}

      <header className="tv-header">
        <div className="tv-brand">
          <img src="/box-box-logo.png" alt="BOX BOX" />
          <div><strong>BOX BOX</strong><span>MUNDIAL 2026</span></div>
        </div>
        <div className="tv-circuit">
          <span>{activeSession.finalized ? "CIRCUITO FINALIZADO" : "EN VIVO"}</span>
          <strong>{activeSession.circuit.bandera} {activeSession.circuit.nombre}</strong>
          <small>{activeSession.circuit.sede} · {activeSession.races.length} carreras</small>
        </div>
        <button type="button" onClick={requestFullscreen}>⛶</button>
      </header>

      <section className="tv-main-grid">
        <div className="tv-standings-card">
          <div className="tv-section-title">
            <span>CLASIFICACIÓN DEL CIRCUITO</span>
            <strong>{activeSession.races.length ? `DESPUÉS DE CARRERA ${activeSession.races.length}` : "SIN RESULTADOS"}</strong>
          </div>
          <div className="tv-table-head"><span>POS</span><span></span><span>PILOTO</span><span>V / P / DNF</span><span>PTS</span></div>
          <div className="tv-table">
            {standings.length ? standings.map((row, index) => {
              const pilot = pilotos.find((item) => item.nombre === row.driver);
              return (
                <div className={`tv-row ${index === 0 ? "leader" : ""} ${index < 3 ? `podium top-${index + 1}` : ""}`} key={row.driver}>
                  <b>{index + 1}</b>
                  <DriverAvatar pilot={pilot || { nombre: row.driver, iniciales: row.driver.slice(0, 2) }} className={index < 3 ? "podium-photo" : ""} />
                  <strong>{row.driver}</strong>
                  <span>{row.wins} / {row.podiums} / {row.dnf}</span>
                  <em>{row.points}</em>
                </div>
              );
            }) : <div className="tv-empty">Esperando la primera bandera a cuadros.</div>}
          </div>
        </div>

        <aside className="tv-side">
          <section className="tv-stat-card rotating-stat">
            <span>BOX BOX DATA</span>
            <p>{comments[commentIndex] || comments[0]}</p>
            <div className="tv-progress"><i key={commentIndex} /></div>
          </section>

          <section className="tv-stat-card">
            <div className="tv-card-head"><span>PRÓXIMA PARRILLA</span><small>INVERTIDA</small></div>
            <div className="tv-mini-grid">
              {nextGrid.slice(0, 8).map((driver, index) => <div key={driver}><b>{index + 1}</b><span>{driver}</span></div>)}
              {!nextGrid.length && <p>Se define al guardar la primera carrera.</p>}
            </div>
          </section>

          <section className="tv-stat-card world-card">
            <div className="tv-card-head"><span>MUNDIAL</span><small>EN VIVO</small></div>
            {worldStandings.slice(0, 3).map((pilot, index) => (
              <div className={`world-row world-top-${index + 1}`} key={pilot.nombre}>
                <b>{index + 1}</b>
                <DriverAvatar pilot={pilot} className="world-photo" />
                <span>{pilot.nombre}</span>
                <strong>{pilot.puntos}</strong>
              </div>
            ))}
          </section>
        </aside>
      </section>

      <footer className="tv-footer">
        <span>RESULTADO ÚLTIMA CARRERA</span>
        <div className="last-result-strip">
          {lastRace ? lastRace.results.slice(0, 7).map((result) => {
            const pilot = pilotos.find((item) => item.nombre === result.driver);
            return (
              <div key={result.driver} className={result.status === "dnf" ? "dnf" : ""}>
                <b>{result.status === "dnf" ? "DNF" : result.position}</b>
                <DriverAvatar pilot={pilot || { nombre: result.driver, iniciales: result.driver.slice(0, 2) }} className="strip-photo" />
                <span>{result.driver}</span>
                <strong>{result.points}</strong>
              </div>
            );
          }) : <p>Sin resultados todavía.</p>}
        </div>
      </footer>
    </main>
  );
}
