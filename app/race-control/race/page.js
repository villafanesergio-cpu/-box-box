"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import styles from "./race.module.css";

function pointsFor(position, starters, status, penalty) {
  if (status === "dnf") return { base: 0, final: 0 };
  const base = Math.max(starters - position + 1, 1);
  return { base, final: Math.max(base + Number(penalty || 0), 0) };
}

export default function RaceDirectionPage() {
  const supabase = useMemo(() => createClient(), []);
  const [season, setSeason] = useState(null);
  const [circuits, setCircuits] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [event, setEvent] = useState(null);
  const [races, setRaces] = useState([]);
  const [selectedCircuit, setSelectedCircuit] = useState("");
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [gridOrder, setGridOrder] = useState([]);
  const [racePhase, setRacePhase] = useState(null);
  const [editingRace, setEditingRace] = useState(null);
  const [message, setMessage] = useState("Cargando Dirección de Carrera...");
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    const { data: activeSeason, error: seasonError } = await supabase
      .from("seasons")
      .select("id,name,year")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (seasonError || !activeSeason) {
      setMessage("No hay temporada activa.");
      return;
    }

    setSeason(activeSeason);

    const [{ data: circuitData }, { data: assignmentData }, { data: openEvent }] = await Promise.all([
      supabase.from("circuits").select("*").eq("active", true).order("name"),
      supabase.from("season_driver_teams").select(`
        id,racing_number,active,
        driver:drivers(id,name,photo_transparent_url,active),
        team:teams(id,name,logo_url,primary_color,secondary_color,active)
      `).eq("season_id", activeSeason.id).eq("active", true).order("racing_number"),
      supabase.from("circuit_events").select("*,circuit:circuits(*)")
        .eq("season_id", activeSeason.id).eq("status", "open").limit(1).maybeSingle()
    ]);

    setCircuits(circuitData ?? []);
    setDrivers((assignmentData ?? []).filter(x => x.driver?.active && x.team?.active));
    setEvent(openEvent ?? null);

    if (openEvent) await loadEvent(openEvent.id, openEvent);
    setMessage("");
  }

  async function loadEvent(eventId, eventData = null) {
    const [{ data: eventRows }, { data: participantRows }, { data: raceRows }] = await Promise.all([
      eventData ? Promise.resolve({ data: eventData }) :
        supabase.from("circuit_events").select("*,circuit:circuits(*)").eq("id", eventId).single(),
      supabase.from("event_participants").select("*").eq("event_id", eventId),
      supabase.from("races").select("*,race_results(*)").eq("event_id", eventId).order("race_number")
    ]);

    setEvent(eventRows);
    setSelectedDrivers((participantRows ?? []).filter(x => x.active).map(x => x.driver_id));
    setRaces(raceRows ?? []);
  }

  async function openCircuit() {
    if (!season || !selectedCircuit || selectedDrivers.length < 2) {
      setMessage("Elegí un circuito y al menos dos pilotos.");
      return;
    }

    if (openingRef.current) return;

    openingRef.current = true;
    setOpening(true);
    setMessage("Abriendo circuito...");

    const circuit = circuits.find(c => c.id === selectedCircuit);

    const { data: userData } = await supabase.auth.getUser();

    const { data: created, error } = await supabase.from("circuit_events").insert({
      season_id: season.id,
      circuit_id: selectedCircuit,
      name: `GP ${circuit.name}`,
      status: "open",
      started_at: new Date().toISOString(),
      created_by: userData?.user?.id ?? null,
    }).select("*,circuit:circuits(*)").single();

    if (error) {
      if (error.code === "23505") {
        const { data: existingEvent } = await supabase
          .from("circuit_events")
          .select("*,circuit:circuits(*)")
          .eq("season_id", season.id)
          .eq("status", "open")
          .limit(1)
          .maybeSingle();

        if (existingEvent) {
          await loadEvent(existingEvent.id, existingEvent);
          setMessage("El circuito ya estaba abierto. Continuamos la sesión existente.");
        } else {
          setMessage("Ya existe otro circuito abierto para esta temporada.");
        }
      } else {
        setMessage(`No se pudo abrir: ${error.message}`);
      }

      openingRef.current = false;
      setOpening(false);
      return;
    }

    const { error: participantError } = await supabase.from("event_participants").insert(
      selectedDrivers.map(driverId => ({
        event_id: created.id,
        driver_id: driverId,
        active: true,
      }))
    );

    if (participantError) {
      openingRef.current = false;
      setOpening(false);
      setMessage(`Circuito abierto, pero fallaron participantes: ${participantError.message}`);
      return;
    }

    setEvent(created);
    setRaces([]);
    openingRef.current = false;
    setOpening(false);
    setMessage("Circuito abierto.");
  }

  async function prepareRace() {
    const active = drivers.filter(d => selectedDrivers.includes(d.driver.id));
    const activeById = new Map(active.map(d => [d.driver.id, d]));
    let grid = active;

    if (races.length) {
      const previousRace = races[races.length - 1];
      const { data: previousResults, error } = await supabase
        .from("race_results")
        .select("driver_id,finish_position,status")
        .eq("race_id", previousRace.id)
        .order("finish_position", { ascending: true, nullsFirst: false });

      if (error) {
        setMessage(`No se pudo preparar la parrilla: ${error.message}`);
        return;
      }

      const ordered = (previousResults ?? [])
        .map(result => activeById.get(result.driver_id))
        .filter(Boolean);
      const included = new Set(ordered.map(d => d.driver.id));
      const missing = active.filter(d => !included.has(d.driver.id));

      grid = [...ordered].reverse().concat(missing);
    }

    const prepared = grid.map((d, index) => ({
      driverId: d.driver.id,
      name: d.driver.name,
      photo: d.driver.photo_transparent_url,
      teamLogo: d.team.logo_url,
      status: "finished",
      position: index + 1,
      penalty: 0,
    }));

    setGridOrder([]);
    setEntries(prepared);
    setRacePhase("grid");
    setEditingRace(null);
    setMessage(
      races.length
        ? "Parrilla invertida generada desde el resultado anterior."
        : "Ordená la parrilla de la primera carrera y confirmala."
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function confirmGrid() {
    setGridOrder(entries.map(entry => entry.driverId));
    setEntries(current =>
      current.map((entry, index) => ({
        ...entry,
        status: "finished",
        position: index + 1,
        penalty: 0,
      }))
    );
    setRacePhase("result");
    setMessage("Parrilla confirmada. Después de la carrera cargá el resultado final.");
  }

  function move(index, direction) {
    setEntries(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((entry, i) => ({ ...entry, position: i + 1 }));
    });
  }

  function patchEntry(driverId, changes) {
    setEntries(current => current.map(e => e.driverId === driverId ? { ...e, ...changes } : e));
  }

  async function saveRace() {
    if (!event || !entries.length || racePhase !== "result") return;

    if (!editingRace && gridOrder.length !== entries.length) {
      setMessage("Primero confirmá la parrilla de salida.");
      return;
    }

    const raceNumber = editingRace?.race_number ?? races.length + 1;
    const { data: userData } = await supabase.auth.getUser();

    let raceId = editingRace?.id;

    if (editingRace) {
      const { error } = await supabase.from("race_results").delete().eq("race_id", raceId);
      if (error) { setMessage(error.message); return; }
      await supabase.from("races").update({
        status: "finished",
        finished_at: new Date().toISOString()
      }).eq("id", raceId);
    } else {
      const { data, error } = await supabase.from("races").insert({
        event_id: event.id,
        race_number: raceNumber,
        status: "finished",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        created_by: userData?.user?.id ?? null,
      }).select("id").single();

      if (error) { setMessage(error.message); return; }
      raceId = data.id;
    }

    const starterRows = gridOrder.map((driverId, index) => ({
      race_id: raceId,
      driver_id: driverId,
      grid_position: index + 1,
    }));

    const resultRows = entries.map((entry, index) => {
      const points = pointsFor(index + 1, entries.length, entry.status, entry.penalty);
      return {
        race_id: raceId,
        driver_id: entry.driverId,
        finish_position: index + 1,
        status: entry.status,
        base_points: points.base,
        penalty_points: Number(entry.penalty || 0),
        final_points: points.final,
      };
    });

    const writes = [supabase.from("race_results").insert(resultRows)];
    if (!editingRace) {
      writes.unshift(supabase.from("race_starters").insert(starterRows));
    }

    const writeResults = await Promise.all(writes);
    const writeError = writeResults.find(result => result.error)?.error;

    if (writeError) {
      setMessage(`Error: ${writeError.message}`);
      return;
    }

    setEntries([]);
    setGridOrder([]);
    setRacePhase(null);
    setEditingRace(null);
    await loadEvent(event.id);
    setMessage(editingRace ? "Carrera corregida." : "Carrera guardada.");
  }

  async function editRace(race) {
    const [{ data: results, error: resultsError }, { data: starters, error: startersError }] =
      await Promise.all([
        supabase
          .from("race_results")
          .select("*")
          .eq("race_id", race.id)
          .order("finish_position", { ascending: true, nullsFirst: false }),
        supabase
          .from("race_starters")
          .select("driver_id,grid_position")
          .eq("race_id", race.id)
          .order("grid_position", { ascending: true }),
      ]);

    const error = resultsError || startersError;
    if (error) {
      setMessage(`No se pudo abrir la carrera: ${error.message}`);
      return;
    }

    const map = new Map(drivers.map(d => [d.driver.id, d]));
    setEntries((results ?? []).map((result, index) => {
      const d = map.get(result.driver_id);
      return {
        driverId: result.driver_id,
        name: d?.driver?.name ?? "Piloto",
        photo: d?.driver?.photo_transparent_url,
        teamLogo: d?.team?.logo_url,
        status: result.status,
        position: index + 1,
        penalty: result.penalty_points,
      };
    }));
    setGridOrder((starters ?? []).map(starter => starter.driver_id));
    setRacePhase("result");
    setEditingRace(race);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRace(race) {
    if (!window.confirm(`¿Eliminar Carrera ${race.race_number}?`)) return;
    const { error } = await supabase.from("races").delete().eq("id", race.id);
    if (error) { setMessage(error.message); return; }
    await loadEvent(event.id);
    setMessage("Carrera eliminada.");
  }

  async function finalizeCircuit() {
    if (!event || !window.confirm("¿Finalizar este circuito?")) return;
    const { error } = await supabase.from("circuit_events").update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
    }).eq("id", event.id);

    if (error) { setMessage(error.message); return; }
    setEvent(null);
    setRaces([]);
    setSelectedDrivers([]);
    setEntries([]);
    setGridOrder([]);
    setRacePhase(null);
    setEditingRace(null);
    setMessage("Circuito finalizado.");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>BOX BOX · RACE CONTROL</span>
          <h1>Dirección de Carrera</h1>
          <p>{season?.name || "Temporada activa"}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/race-control" className={styles.secondary}>Dashboard</Link>
          <Link href="/race-control/circuits" className={styles.primary}>Circuitos</Link>
        </div>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      {!event ? (
        <section className={styles.startPanel}>
          <div>
            <span>ABRIR CIRCUITO</span>
            <h2>Nueva sesión</h2>
          </div>

          <label>Circuito
            <select value={selectedCircuit} onChange={(e) => setSelectedCircuit(e.target.value)}>
              <option value="">Seleccionar circuito</option>
              {circuits.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
            </select>
          </label>

          <div className={styles.driverSelector}>
            {drivers.map(d => {
              const active = selectedDrivers.includes(d.driver.id);
              return (
                <button key={d.driver.id} type="button" className={active ? styles.selected : ""} onClick={() => {
                  setSelectedDrivers(current => active ? current.filter(id => id !== d.driver.id) : [...current, d.driver.id]);
                }}>
                  <img src={d.driver.photo_transparent_url || ""} alt={d.driver.name} />
                  <strong>#{d.racing_number} {d.driver.name}</strong>
                  <small>{active ? "PRESENTE" : "NO PARTICIPA"}</small>
                </button>
              );
            })}
          </div>

          <button
            className={styles.openButton}
            onClick={openCircuit}
            disabled={opening || !selectedCircuit || selectedDrivers.length < 2}
          >
            {opening ? "ABRIENDO..." : "ABRIR CIRCUITO"}
          </button>
        </section>
      ) : (
        <>
          <section className={styles.eventHero}>
            <div>
              <span>CIRCUITO ABIERTO</span>
              <h2>{event.circuit?.flag} {event.circuit?.name}</h2>
              <p>{event.circuit?.country} · {races.length} carreras cargadas</p>
            </div>
            <button onClick={finalizeCircuit}>FINALIZAR CIRCUITO</button>
          </section>

          {entries.length ? (
            <section className={styles.editor}>
              <div className={styles.panelHead}>
                <div>
                  <span>{racePhase === "grid" ? "PARRILLA" : "RESULTADO"}</span>
                  <h2>
                    {editingRace
                      ? `Corregir Carrera ${editingRace.race_number}`
                      : racePhase === "grid"
                        ? `Parrilla Carrera ${races.length + 1}`
                        : `Carrera ${races.length + 1}`}
                  </h2>
                </div>
                <button onClick={() => {
                  setEntries([]);
                  setGridOrder([]);
                  setRacePhase(null);
                  setEditingRace(null);
                }}>Cancelar</button>
              </div>

              <div className={styles.resultList}>
                {entries.map((entry, index) => {
                  const pts = pointsFor(index + 1, entries.length, entry.status, entry.penalty);
                  return (
                    <article
                      key={entry.driverId}
                      className={racePhase === "result" && entry.status === "dnf" ? styles.dnf : ""}
                    >
                      <div className={styles.moveButtons}>
                        <button onClick={() => move(index, -1)}>▲</button>
                        <button onClick={() => move(index, 1)}>▼</button>
                      </div>
                      <strong>
                        {racePhase === "result" && entry.status === "dnf" ? "DNF" : `${index + 1}°`}
                      </strong>
                      <img src={entry.teamLogo || ""} alt="" />
                      <img src={entry.photo || ""} alt={entry.name} />
                      <div>
                        <b>{entry.name}</b>
                        <small>
                          {racePhase === "grid"
                            ? "Posición de largada"
                            : `${pts.base} base · ${entry.penalty} penalización`}
                        </small>
                      </div>

                      {racePhase === "result" ? (
                        <>
                          <button onClick={() => patchEntry(entry.driverId, {
                            status: entry.status === "dnf" ? "finished" : "dnf",
                            penalty: 0
                          })}>
                            {entry.status === "dnf" ? "FINALIZÓ" : "DNF"}
                          </button>
                          <div className={styles.penalty}>
                            <button
                              disabled={entry.status === "dnf"}
                              onClick={() => patchEntry(entry.driverId, {
                                penalty: Number(entry.penalty) - 1
                              })}
                            >−</button>
                            <span>{entry.penalty}</span>
                            <button
                              disabled={entry.status === "dnf"}
                              onClick={() => patchEntry(entry.driverId, {
                                penalty: Number(entry.penalty) + 1
                              })}
                            >+</button>
                          </div>
                          <strong>{pts.final} PTS</strong>
                        </>
                      ) : (
                        <>
                          <button disabled>PARRILLA</button>
                          <div className={styles.penalty}><span></span><span>—</span><span></span></div>
                          <strong>SALIDA</strong>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              <button
                className={styles.openButton}
                onClick={racePhase === "grid" ? confirmGrid : saveRace}
              >
                {racePhase === "grid"
                  ? "CONFIRMAR PARRILLA"
                  : editingRace
                    ? "GUARDAR CORRECCIÓN"
                    : "GUARDAR RESULTADO"}
              </button>
            </section>
          ) : (
            <button className={styles.prepare} onClick={prepareRace}>PREPARAR CARRERA {races.length + 1}</button>
          )}

          <section className={styles.history}>
            <div className={styles.panelHead}><div><span>HISTORIAL</span><h2>Carreras cargadas</h2></div><strong>{races.length}</strong></div>
            {!races.length && <p>Sin carreras todavía.</p>}
            {[...races].reverse().map(race => (
              <article key={race.id}>
                <div><span>CARRERA {race.race_number}</span><strong>{race.race_results?.find(r => r.status === "finished" && r.finish_position === 1)?.final_points ?? "—"} pts al ganador</strong></div>
                <div>
                  <button onClick={() => editRace(race)}>Corregir</button>
                  <button onClick={() => deleteRace(race)}>Eliminar</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
