"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { circuitos2026, ganadores, noticias, pilotos } from "../lib/boxbox-data";
import {
  LIVE_CHANNEL,
  STORAGE_KEY,
  buildRaceResult,
  calculateCircuitStandings,
  calculateWorldStandings,
  createId,
  isResultOrderValid,
  nextGridFromRace,
  pointsForEntry
} from "../lib/race-utils";

const initialRaceState = { sessions: [], activeSessionId: null };

function DriverAvatar({ pilot, className = "" }) {
  const initials = pilot?.iniciales || pilot?.nombre?.slice(0, 2).toUpperCase() || "—";
  return (
    <span className={`driver-avatar ${className}`.trim()} aria-label={pilot?.nombre || "Piloto"}>
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

const renumberRaces = (races) => races.map((race, index) => ({ ...race, number: index + 1 }));

function Tabla({ lista = pilotos, limite }) {
  const rows = limite ? lista.slice(0, limite) : lista;
  return (
    <div className="tabla">
      {rows.map((p, i) => (
        <div className={`fila standings-row ${i < 3 ? `standings-top top-${i + 1}` : ""}`} key={p.nombre}>
          <div className={`pos pos-${i + 1}`}>{i + 1}</div>
          <DriverAvatar pilot={p} className={i < 3 ? "standings-photo" : ""} />
          <div className="piloto-info">
            <strong>{p.nombre}</strong>
            <span>{p.escuderia} · {p.victorias} circuitos · {p.dnfTotal ?? p.dnf} DNF</span>
          </div>
          <div className="pts">{p.puntos}<small>PTS</small></div>
        </div>
      ))}
    </div>
  );
}

function DriverSelector({ selected, onToggle }) {
  return (
    <div className="selector-pilotos">
      {pilotos.map((pilot) => {
        const active = selected.includes(pilot.nombre);
        return (
          <button
            type="button"
            key={pilot.nombre}
            onClick={() => onToggle(pilot.nombre)}
            className={active ? "seleccionado" : ""}
          >
            <DriverAvatar pilot={pilot} />
            <strong>{pilot.nombre}</strong>
            <small>{active ? "LARGA" : "NO PARTICIPA"}</small>
          </button>
        );
      })}
    </div>
  );
}

function ResultEditor({ entries, setEntries, onSave, onCancel, editing }) {
  const draggingRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const validOrder = isResultOrderValid(entries);

  const moveDriver = (fromDriver, toDriver) => {
    if (!fromDriver || !toDriver || fromDriver === toDriver) return;
    setEntries((current) => {
      const from = current.findIndex((item) => item.driver === fromDriver);
      const to = current.findIndex((item) => item.driver === toDriver);
      if (from < 0 || to < 0) return current;
      const copy = [...current];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  const startDrag = (event, driver) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = driver;
    setDragging(driver);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueDrag = (event) => {
    const fromDriver = draggingRef.current;
    if (!fromDriver) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-race-driver]");
    const toDriver = target?.dataset?.raceDriver;
    if (toDriver) moveDriver(fromDriver, toDriver);
  };

  const stopDrag = () => {
    draggingRef.current = null;
    setDragging(null);
  };

  const updateEntry = (driver, changes) => {
    setEntries((current) => current.map((entry) => entry.driver === driver ? { ...entry, ...changes } : entry));
  };

  return (
    <section className="race-editor">
      <div className="race-editor-head">
        <div>
          <span className="section-kicker">RESULTADO</span>
          <h2>{editing ? "Corregir carrera" : "Orden de llegada"}</h2>
          <p>Arrastrá desde el ícono ⠿. Los DNF deben quedar debajo de quienes finalizaron.</p>
        </div>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
      </div>

      <div className="result-list">
        {entries.map((entry, index) => {
          const pilot = pilotos.find((item) => item.nombre === entry.driver);
          const points = pointsForEntry(entry, index, entries.length);
          return (
            <article
              key={entry.driver}
              data-race-driver={entry.driver}
              className={`result-row ${entry.status === "dnf" ? "is-dnf" : ""} ${dragging === entry.driver ? "is-dragging" : ""}`}
            >
              <button
                type="button"
                className="drag-handle"
                aria-label={`Mover a ${entry.driver}`}
                onPointerDown={(event) => startDrag(event, entry.driver)}
                onPointerMove={continueDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >⠿</button>
              <div className="result-position">{entry.status === "dnf" ? "DNF" : `${index + 1}°`}</div>
              <DriverAvatar pilot={pilot || { nombre: entry.driver, iniciales: entry.driver.slice(0, 2) }} />
              <div className="result-driver">
                <strong>{entry.driver}</strong>
                <span>{entry.status === "dnf" ? "Abandono · 0 puntos" : `${points.basePoints} puntos base`}</span>
              </div>
              <button
                type="button"
                className={`status-toggle ${entry.status === "dnf" ? "active" : ""}`}
                onClick={() => updateEntry(entry.driver, {
                  status: entry.status === "dnf" ? "finished" : "dnf",
                  penalty: 0
                })}
              >
                {entry.status === "dnf" ? "MARCAR FINALIZÓ" : "MARCAR DNF"}
              </button>
              <div className="penalty-control" aria-label={`Penalización de ${entry.driver}`}>
                <button
                  type="button"
                  disabled={entry.status === "dnf"}
                  onClick={() => updateEntry(entry.driver, { penalty: Number(entry.penalty || 0) - 1 })}
                >−</button>
                <span>{Number(entry.penalty || 0) > 0 ? "+" : ""}{entry.penalty || 0}</span>
                <button
                  type="button"
                  disabled={entry.status === "dnf"}
                  onClick={() => updateEntry(entry.driver, { penalty: Number(entry.penalty || 0) + 1 })}
                >+</button>
              </div>
              <div className="result-points">{points.points}<small>PTS</small></div>
            </article>
          );
        })}
      </div>

      {!validOrder && (
        <div className="validation-error">Los DNF tienen que quedar al final. Podés ordenar entre ellos como quieras.</div>
      )}

      <div className="editor-actions">
        <span>{entries.length} pilotos · escala {entries.length} a 1 · DNF 0</span>
        <button type="button" className="btn rojo" disabled={!validOrder} onClick={onSave}>
          {editing ? "Guardar corrección" : "Guardar resultado"}
        </button>
      </div>
    </section>
  );
}

function CircuitStandings({ rows }) {
  if (!rows.length) return <p className="ayuda">Todavía no hay resultados en este circuito.</p>;
  return (
    <div className="circuit-table">
      {rows.map((row, index) => {
        const pilot = pilotos.find((item) => item.nombre === row.driver);
        return (
          <div className={`circuit-row ${index < 3 ? `podium-row podium-${index + 1}` : ""}`} key={row.driver}>
            <b>{index + 1}</b>
            <DriverAvatar pilot={pilot || { nombre: row.driver, iniciales: row.driver.slice(0, 2) }} className={index < 3 ? "circuit-photo" : ""} />
            <span>{row.driver}</span>
            <small>{row.wins} V · {row.podiums} P · {row.dnf} DNF</small>
            <strong>{row.points} PTS</strong>
          </div>
        );
      })}
    </div>
  );
}

function buildCircuitSummaryText(session, standings) {
  if (!session) return "";
  const winner = standings[0];
  const totalDnf = standings.reduce((sum, row) => sum + row.dnf, 0);
  const lines = [
    `🏁 BOX BOX — ${session.circuit.nombre}`,
    `${session.circuit.sede}, ${session.circuit.pais}`,
    `${session.races.length} carrera${session.races.length === 1 ? "" : "s"} · ${totalDnf} DNF`,
    "",
    winner ? `🏆 Ganador: ${winner.driver} — ${winner.points} pts` : "Sin ganador",
    "",
    "CLASIFICACIÓN FINAL"
  ];

  standings.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.driver} — ${row.points} pts · ${row.wins} victorias · ${row.podiums} podios · ${row.dnf} DNF`);
  });

  lines.push("", "RESULTADOS POR CARRERA");
  session.races.forEach((race) => {
    const winnerResult = race.results.find((result) => result.status !== "dnf");
    const dnfCount = race.results.filter((result) => result.status === "dnf").length;
    lines.push(`Carrera ${race.number}: ${winnerResult?.driver || "Sin ganador"} · ${race.starters} pilotos · ${dnfCount} DNF`);
  });

  return lines.join("\n");
}

function CircuitSummary({ session, standings }) {
  const [copied, setCopied] = useState(false);
  if (!session?.finalized) return null;

  const totalDnf = standings.reduce((sum, row) => sum + row.dnf, 0);
  const totalStarts = session.races.reduce((sum, race) => sum + race.starters, 0);
  const uniqueDrivers = new Set(session.races.flatMap((race) => race.results.map((result) => result.driver))).size;
  const winner = standings[0];

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildCircuitSummaryText(session, standings));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert("No se pudo copiar automáticamente. Probá desde otro navegador.");
    }
  };

  const downloadSummary = () => {
    const data = {
      circuit: session.circuit,
      startedAt: session.startedAt,
      finalizedAt: session.finalizedAt,
      races: session.races,
      standings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `box-box-${session.circuit.id}-resumen.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="circuit-summary">
      <div className="summary-hero">
        <div>
          <span className="section-kicker">RESUMEN FINAL</span>
          <h2>{session.circuit.nombre}</h2>
          <p>{session.circuit.sede}, {session.circuit.pais}</p>
        </div>
        <div className="summary-winner">
          <small>GANADOR DEL CIRCUITO</small>
          <strong>{winner?.driver || "Sin ganador"}</strong>
          <span>{winner?.points || 0} PTS</span>
        </div>
      </div>

      <div className="summary-metrics">
        <article><span>Carreras</span><strong>{session.races.length}</strong></article>
        <article><span>Pilotos</span><strong>{uniqueDrivers}</strong></article>
        <article><span>Largadas</span><strong>{totalStarts}</strong></article>
        <article><span>DNF</span><strong>{totalDnf}</strong></article>
      </div>

      <div className="summary-grid">
        <section className="panel">
          <div className="panel-head"><h2>Clasificación final</h2><span>Desempate aplicado</span></div>
          <CircuitStandings rows={standings} />
        </section>

        <section className="panel summary-races">
          <div className="panel-head"><h2>Carrera por carrera</h2><span>{session.races.length}</span></div>
          {session.races.map((race) => {
            const winnerResult = race.results.find((result) => result.status !== "dnf");
            const dnfCount = race.results.filter((result) => result.status === "dnf").length;
            return (
              <article key={race.id}>
                <div><span>CARRERA {race.number}</span><strong>{winnerResult?.driver || "Sin ganador"}</strong></div>
                <small>{race.starters} pilotos · {dnfCount} DNF</small>
              </article>
            );
          })}
        </section>
      </div>

      <div className="summary-actions">
        <button type="button" className="btn ghost" onClick={copySummary}>{copied ? "RESUMEN COPIADO" : "COPIAR RESUMEN"}</button>
        <button type="button" className="btn rojo" onClick={downloadSummary}>DESCARGAR DATOS</button>
      </div>
    </section>
  );
}

export default function Home() {
  const [section, setSection] = useState("inicio");
  const [raceState, setRaceState] = useState(initialRaceState);
  const [hydrated, setHydrated] = useState(false);
  const [selectedCircuit, setSelectedCircuit] = useState("japon");
  const [selectedDrivers, setSelectedDrivers] = useState(() => pilotos.slice(0, 7).map((pilot) => pilot.nombre));
  const [entries, setEntries] = useState([]);
  const [editingRaceId, setEditingRaceId] = useState(null);
  const [changingCircuit, setChangingCircuit] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setRaceState(JSON.parse(saved));
    } catch (error) {
      console.error("No se pudo cargar Race Control", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(raceState));
    try {
      const channel = new BroadcastChannel(LIVE_CHANNEL);
      channel.postMessage(raceState);
      channel.close();
    } catch {
      // BroadcastChannel puede no estar disponible en navegadores antiguos.
    }
  }, [raceState, hydrated]);

  const activeSession = useMemo(
    () => raceState.sessions.find((session) => session.id === raceState.activeSessionId) || null,
    [raceState]
  );
  const circuitStandings = useMemo(
    () => calculateCircuitStandings(activeSession?.races || []),
    [activeSession]
  );
  const worldStandings = useMemo(
    () => calculateWorldStandings(pilotos, raceState.sessions),
    [raceState.sessions]
  );
  const lastRace = activeSession?.races?.at(-1) || null;
  const nextGrid = useMemo(
    () => lastRace ? nextGridFromRace(lastRace, selectedDrivers) : [],
    [lastRace, selectedDrivers]
  );

  const setActiveSession = (sessionId) => {
    setRaceState((current) => ({ ...current, activeSessionId: sessionId }));
    setEntries([]);
    setEditingRaceId(null);
    const session = raceState.sessions.find((item) => item.id === sessionId);
    const previousDrivers = session?.races?.at(-1)?.results?.map((result) => result.driver);
    if (previousDrivers?.length) setSelectedDrivers(previousDrivers);
  };

  const startCircuit = () => {
    const circuit = circuitos2026.find((item) => item.id === selectedCircuit);
    if (!circuit) return;
    const session = {
      id: createId("circuit"),
      circuit,
      startedAt: new Date().toISOString(),
      finalized: false,
      finalizedAt: null,
      races: [],
      history: []
    };
    setRaceState((current) => ({
      sessions: [...current.sessions, session],
      activeSessionId: session.id
    }));
    setEntries([]);
    setEditingRaceId(null);
  };

  const toggleDriver = (driver) => {
    setSelectedDrivers((current) => current.includes(driver)
      ? current.filter((item) => item !== driver)
      : [...current, driver]
    );
  };

  const prepareRace = () => {
    if (selectedDrivers.length < 2) return;
    const order = nextGridFromRace(lastRace, selectedDrivers);
    setEntries(order.map((driver) => ({ driver, status: "finished", penalty: 0 })));
    setEditingRaceId(null);
  };

  const updateActiveSession = (updater) => {
    setRaceState((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id === current.activeSessionId ? updater(session) : session)
    }));
  };

  const saveResult = () => {
    if (!activeSession || !isResultOrderValid(entries)) return;
    const results = buildRaceResult(entries);
    const now = new Date().toISOString();

    updateActiveSession((session) => {
      if (editingRaceId) {
        const previous = session.races.find((race) => race.id === editingRaceId);
        const updatedRace = {
          ...previous,
          results,
          starters: results.length,
          updatedAt: now
        };
        return {
          ...session,
          races: session.races.map((race) => race.id === editingRaceId ? updatedRace : race),
          history: [...session.history, {
            id: createId("history"),
            type: "edit",
            user: "Sergio",
            at: now,
            before: previous,
            after: updatedRace
          }]
        };
      }

      const newRace = {
        id: createId("race"),
        number: session.races.length + 1,
        createdAt: now,
        updatedAt: now,
        starters: results.length,
        startingGrid: nextGridFromRace(session.races.at(-1), results.map((result) => result.driver)),
        results
      };
      return {
        ...session,
        races: [...session.races, newRace],
        history: [...session.history, {
          id: createId("history"),
          type: "create",
          user: "Sergio",
          at: now,
          before: null,
          after: newRace
        }]
      };
    });

    setSelectedDrivers(results.map((result) => result.driver));
    setEntries([]);
    setEditingRaceId(null);
  };

  const editRace = (race) => {
    setEditingRaceId(race.id);
    setSelectedDrivers(race.results.map((result) => result.driver));
    setEntries(race.results.map((result) => ({
      driver: result.driver,
      status: result.status,
      penalty: result.penalty || 0
    })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRace = (race) => {
    const confirmed = window.confirm(`¿Eliminar la Carrera ${race.number}? Se recalcularán todos los puntos del circuito y del Mundial.`);
    if (!confirmed) return;
    const now = new Date().toISOString();

    updateActiveSession((session) => {
      const deletedIndex = session.races.findIndex((item) => item.id === race.id);
      return {
        ...session,
        races: renumberRaces(session.races.filter((item) => item.id !== race.id)),
        history: [...session.history, {
          id: createId("history"),
          type: "delete",
          user: "Sergio",
          at: now,
          index: deletedIndex,
          before: race,
          after: null
        }]
      };
    });

    if (editingRaceId === race.id) {
      setEntries([]);
      setEditingRaceId(null);
    }
  };

  const undoLastAction = () => {
    if (!activeSession?.history?.length) return;
    const lastAction = activeSession.history.at(-1);
    const confirmed = window.confirm("¿Deshacer el último cambio?");
    if (!confirmed) return;

    updateActiveSession((session) => {
      let races = [...session.races];
      if (lastAction.type === "create") {
        races = races.filter((race) => race.id !== lastAction.after.id);
      }
      if (lastAction.type === "edit" && lastAction.before) {
        races = races.map((race) => race.id === lastAction.before.id ? lastAction.before : race);
      }
      if (lastAction.type === "delete" && lastAction.before) {
        const restoreIndex = Math.max(0, Math.min(lastAction.index ?? races.length, races.length));
        races.splice(restoreIndex, 0, lastAction.before);
      }
      return { ...session, races: renumberRaces(races), history: session.history.slice(0, -1) };
    });
    setEntries([]);
    setEditingRaceId(null);
  };

  const changeActiveCircuit = (circuitId) => {
    if (!activeSession) return;
    const circuit = circuitos2026.find((item) => item.id === circuitId);
    if (!circuit || circuit.id === activeSession.circuit.id) {
      setChangingCircuit(false);
      return;
    }

    if (activeSession.races.length > 0) {
      const confirmed = window.confirm(
        `Este circuito ya tiene ${activeSession.races.length} carrera${activeSession.races.length === 1 ? "" : "s"}. ¿Cambiarlo a ${circuit.nombre} conservando todos los resultados?`
      );
      if (!confirmed) return;
    }

    const now = new Date().toISOString();
    updateActiveSession((session) => ({
      ...session,
      circuit,
      history: [...session.history, {
        id: createId("history"),
        type: "circuit-change",
        user: "Sergio",
        at: now,
        before: session.circuit,
        after: circuit
      }]
    }));
    setSelectedCircuit(circuit.id);
    setChangingCircuit(false);
  };

  const finalizeCircuit = () => {
    if (!activeSession?.races?.length) return;
    const confirmed = window.confirm("¿Finalizar este circuito y fijar al ganador?");
    if (!confirmed) return;
    updateActiveSession((session) => ({
      ...session,
      finalized: true,
      finalizedAt: new Date().toISOString()
    }));
  };

  const reopenCircuit = () => {
    updateActiveSession((session) => ({ ...session, finalized: false, finalizedAt: null }));
  };

  const openTV = () => window.open("/tv", "boxbox-tv");

  return (
    <main className="app">
      <header className="header">
        <div className="marca">
          <img src="/box-box-logo.png" alt="BOX BOX" />
          <div><strong>BOX BOX</strong><span>Mundial 2026</span></div>
        </div>
        <button type="button" className="pill">Temporada activa</button>
      </header>

      <section className={`vista ${section === "inicio" ? "activa" : ""}`}>
        <div className="hero">
          <div>
            <span className="eyebrow">SIMRACING ENTRE AMIGOS</span>
            <h1>BOX BOX<br />MUNDIAL 2026</h1>
            <p>Noticias, estadísticas, pilotos y resultados de toda la competición.</p>
            <div className="acciones">
              <button type="button" onClick={() => setSection("estadisticas")} className="btn rojo">Ver campeonato</button>
              <button type="button" onClick={() => setSection("carrera")} className="btn oscuro">Abrir Modo Carrera</button>
            </div>
          </div>
        </div>

        <div className="resumen-grid">
          <article className="card"><span>Líder</span><strong>{worldStandings[0]?.nombre}</strong><small>{worldStandings[0]?.puntos} puntos</small></article>
          <article className="card"><span>Diferencia</span><strong>{(worldStandings[0]?.puntos || 0) - (worldStandings[1]?.puntos || 0)} pts</strong><small>{worldStandings[1]?.nombre} persigue</small></article>
          <article className="card"><span>Circuitos cargados</span><strong>{raceState.sessions.length}</strong><small>Desde Race Control</small></article>
          <article className="card"><span>Más DNF</span><strong>Rodri</strong><small>14 abandonos base</small></article>
        </div>

        <div className="dos-columnas">
          <section className="panel">
            <div className="panel-head"><h2>Campeonato</h2><button type="button" onClick={() => setSection("estadisticas")}>Ver todo</button></div>
            <Tabla lista={worldStandings} limite={6} />
          </section>
          <section className="panel noticias">
            <div className="panel-head"><h2>Noticias BOX BOX</h2></div>
            {noticias.map((item) => <article key={item.titulo}><strong>{item.titulo}</strong><p>{item.texto}</p></article>)}
          </section>
        </div>
      </section>

      <section className={`vista ${section === "estadisticas" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>📊</span><div><h1>Estadísticas</h1><p>Todo el Mundial 2026 en un solo lugar.</p></div></div>
        <div className="dos-columnas">
          <section className="panel"><div className="panel-head"><h2>Campeonato de pilotos</h2></div><Tabla lista={worldStandings} /></section>
          <div className="stack">
            <section className="panel">
              <div className="panel-head"><h2>Cazadores de trofeos</h2></div>
              {ganadores.map((winner) => <div className="trofeo" key={winner.piloto}><strong>{winner.piloto}</strong><span>{winner.gps.length} victorias</span><small>{winner.gps.join(" · ")}</small></div>)}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Rey del DNF</h2></div>
              {[...worldStandings].sort((a, b) => (b.dnfTotal ?? b.dnf) - (a.dnfTotal ?? a.dnf)).slice(0, 5).map((pilot, index) => <div className="mini-fila" key={pilot.nombre}><b>{index + 1}</b><span>{pilot.nombre}</span><strong>{pilot.dnfTotal ?? pilot.dnf}</strong></div>)}
            </section>
          </div>
        </div>
      </section>

      <section className={`vista ${section === "carrera" ? "activa" : ""}`}>
        <div className="race-titlebar">
          <div>
            <span className="section-kicker">LIVE OPERATIONS</span>
            <h1>MODO CARRERA</h1>
            <p>Circuitos, resultados, DNF, penalizaciones y parrilla invertida.</p>
          </div>
          <button type="button" className="btn tv-button" onClick={openTV}>ABRIR MODO TV ↗</button>
        </div>

        {!hydrated && <section className="panel"><p className="ayuda">Cargando Race Control…</p></section>}

        {hydrated && !activeSession && (
          <section className="circuit-launch">
            <div className="launch-copy">
              <span className="section-kicker">NUEVO CIRCUITO</span>
              <h2>Elegí dónde se corre</h2>
              <p>La cantidad de carreras se decide durante la jornada. Podés finalizar el circuito cuando el grupo quiera.</p>
            </div>
            <div className="circuit-picker">
              {circuitos2026.map((circuit) => (
                <button
                  type="button"
                  key={circuit.id}
                  onClick={() => setSelectedCircuit(circuit.id)}
                  className={selectedCircuit === circuit.id ? "active" : ""}
                >
                  <span>{circuit.bandera}</span>
                  <strong>{circuit.nombre}</strong>
                  <small>{circuit.sede}{circuit.nuevo ? " · NUEVO" : ""}</small>
                </button>
              ))}
            </div>
            <button type="button" className="btn rojo launch-button" onClick={startCircuit}>INICIAR CIRCUITO</button>
          </section>
        )}

        {hydrated && activeSession && (
          <>
            <section className="live-circuit-banner">
              <div className="circuit-flag">{activeSession.circuit.bandera}</div>
              <div>
                <span>{activeSession.finalized ? "CIRCUITO FINALIZADO" : "CIRCUITO EN VIVO"}</span>
                <h2>{activeSession.circuit.nombre}</h2>
                <p>{activeSession.circuit.sede}, {activeSession.circuit.pais} · {activeSession.races.length} carrera{activeSession.races.length === 1 ? "" : "s"}</p>
              </div>
              <div className="banner-actions">
                {activeSession.finalized ? (
                  <>
                    <strong>{circuitStandings[0]?.driver || "Sin ganador"}</strong>
                    <button type="button" className="btn ghost" onClick={reopenCircuit}>Reabrir</button>
                    <button type="button" className="btn rojo" onClick={() => {
                      setRaceState((current) => ({ ...current, activeSessionId: null }));
                      setEntries([]);
                    }}>Nuevo circuito</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn ghost" onClick={() => setChangingCircuit((value) => !value)}>Cambiar circuito</button>
                    <button type="button" className="btn ghost" disabled={!activeSession.races.length} onClick={finalizeCircuit}>Finalizar circuito</button>
                  </>
                )}
              </div>
            </section>

            {changingCircuit && !activeSession.finalized && (
              <section className="change-circuit-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">CORREGIR CIRCUITO</span>
                    <h2>Elegí el circuito correcto</h2>
                  </div>
                  <button type="button" onClick={() => setChangingCircuit(false)}>Cancelar</button>
                </div>
                <p className="ayuda">
                  {activeSession.races.length
                    ? "Los resultados ya cargados se conservarán y quedarán asociados al nuevo circuito."
                    : "Como todavía no hay carreras, el cambio es inmediato."}
                </p>
                <div className="circuit-picker compact">
                  {circuitos2026.map((circuit) => (
                    <button
                      type="button"
                      key={circuit.id}
                      onClick={() => changeActiveCircuit(circuit.id)}
                      className={activeSession.circuit.id === circuit.id ? "active" : ""}
                    >
                      <span>{circuit.bandera}</span>
                      <strong>{circuit.nombre}</strong>
                      <small>{circuit.sede}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <CircuitSummary session={activeSession} standings={circuitStandings} />

            {entries.length > 0 ? (
              <ResultEditor
                entries={entries}
                setEntries={setEntries}
                onSave={saveResult}
                onCancel={() => { setEntries([]); setEditingRaceId(null); }}
                editing={Boolean(editingRaceId)}
              />
            ) : (
              <div className="race-control-grid">
                <section className="panel participant-panel">
                  <div className="panel-head">
                    <div><span className="section-kicker">PRÓXIMA CARRERA</span><h2>Pilotos que largan</h2></div>
                    <strong>{selectedDrivers.length}</strong>
                  </div>
                  <DriverSelector selected={selectedDrivers} onToggle={toggleDriver} />
                  {!activeSession.finalized && (
                    <button type="button" className="btn rojo ancho" disabled={selectedDrivers.length < 2} onClick={prepareRace}>
                      PREPARAR CARRERA {activeSession.races.length + 1}
                    </button>
                  )}
                </section>

                <aside className="race-side-stack">
                  <section className="panel next-grid-panel">
                    <div className="panel-head"><h2>Próxima parrilla</h2><span>Invertida</span></div>
                    {nextGrid.map((driver, index) => (
                      <div className="grid-row" key={driver}><b>{index + 1}</b><span>{driver}</span></div>
                    ))}
                    {!nextGrid.length && <p className="ayuda">La primera carrera se ordena manualmente.</p>}
                  </section>

                  <section className="panel">
                    <div className="panel-head"><h2>Acumulado del circuito</h2><span>En vivo</span></div>
                    <CircuitStandings rows={circuitStandings} />
                  </section>
                </aside>
              </div>
            )}

            <div className="race-history-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Carreras cargadas</h2>
                  <button type="button" disabled={!activeSession.history.length} onClick={undoLastAction}>Deshacer último cambio</button>
                </div>
                {!activeSession.races.length && <p className="ayuda">Todavía no guardaste ninguna carrera.</p>}
                {[...activeSession.races].reverse().map((race) => (
                  <article className="saved-race" key={race.id}>
                    <div><span>CARRERA {race.number}</span><strong>{race.results.find((result) => result.status !== "dnf")?.driver || "Sin ganador"}</strong></div>
                    <p>{race.starters} pilotos · {race.results.filter((result) => result.status === "dnf").length} DNF</p>
                    <div className="saved-race-actions">
                      <button type="button" onClick={() => editRace(race)}>Corregir</button>
                      <button type="button" className="danger" onClick={() => deleteRace(race)}>Eliminar</button>
                    </div>
                  </article>
                ))}
              </section>

              <section className="panel session-history">
                <div className="panel-head"><h2>Circuitos de la jornada</h2><span>{raceState.sessions.length}</span></div>
                {[...raceState.sessions].reverse().map((session) => (
                  <button type="button" key={session.id} className={session.id === activeSession.id ? "active" : ""} onClick={() => setActiveSession(session.id)}>
                    <span>{session.circuit.bandera}</span>
                    <div><strong>{session.circuit.nombre}</strong><small>{session.races.length} carreras · {session.finalized ? "Finalizado" : "Abierto"}</small></div>
                  </button>
                ))}
                <div className="audit-log">
                  <span className="section-kicker">ÚLTIMOS CAMBIOS</span>
                  {!activeSession.history.length && <p className="ayuda">Sin cambios registrados.</p>}
                  {[...activeSession.history].reverse().slice(0, 4).map((change) => {
                    const raceNumber = change.after?.number ?? change.before?.number;
                    const label = change.type === "edit"
                      ? `Carrera ${raceNumber} corregida`
                      : change.type === "delete"
                        ? `Carrera ${raceNumber} eliminada`
                        : change.type === "circuit-change"
                          ? `Circuito cambiado a ${change.after?.nombre}`
                          : `Carrera ${raceNumber} cargada`;
                    return (
                      <div key={change.id}>
                        <strong>{label}</strong>
                        <small>{change.user} · {new Date(change.at).toLocaleString("es-AR")}</small>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </section>

      <section className={`vista ${section === "pilotos" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>👤</span><div><h1>Pilotos</h1><p>Foto, número, escudería y rendimiento.</p></div></div>
        <div className="pilotos-grid">
          {worldStandings.map((pilot) => (
            <article className="piloto-card" key={pilot.nombre}>
              <div className="foto-placeholder">
                <DriverAvatar pilot={pilot} className="profile-photo" />
              </div>
              <div className="numero">#{pilot.numero}</div>
              <h3>{pilot.nombre}</h3><p>{pilot.escuderia}</p>
              <div className="metricas"><span><b>{pilot.puntos}</b>PTS</span><span><b>{pilot.victorias}</b>CIR</span><span><b>{pilot.dnfTotal}</b>DNF</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className={`vista ${section === "admin" ? "activa" : ""}`}>
        <div className="titulo-seccion"><span>⚙️</span><div><h1>Race Control</h1><p>Panel administrable de BOX BOX.</p></div></div>
        <div className="admin-grid">
          {[
            ["Pilotos", "Alta, baja, edición, foto, número y escudería."],
            ["Escuderías", "Nombre, logo, colores y estado."],
            ["Temporadas", "Crear nuevas temporadas y mantener el historial."],
            ["Circuitos", "Calendario vigente, bandera e imagen propia."],
            ["Resultados", "Carga, corrección, DNF y penalizaciones."],
            ["Configuración", "Sistema de puntos, permisos y opciones."]
          ].map(([title, description]) => <button type="button" className="admin-card" key={title}><strong>{title}</strong><span>{description}</span></button>)}
        </div>
        <div className="aviso">Esta versión guarda los resultados en este navegador. Supabase permitirá sincronizar celular y TV en dispositivos diferentes.</div>
      </section>

      <nav className="nav">
        {[
          ["inicio", "🏠", "Inicio"],
          ["estadisticas", "📊", "Estadísticas"],
          ["carrera", "🏁", "Modo Carrera"],
          ["pilotos", "👤", "Pilotos"],
          ["admin", "⚙️", "Race Control"]
        ].map(([id, icon, label]) => (
          <button type="button" key={id} onClick={() => setSection(id)} className={section === id ? "activo" : ""}>
            <span>{icon}</span><small>{label}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}
