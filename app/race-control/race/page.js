"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import styles from "./race.module.css";
import { RACE_TYPES, PIT_LABELS, pointsFor, nextRaceNumber, suggestedType,
  defaultGridMode, buildGrid, makeRaceControl } from "../../../lib/race-format.mjs";

function formatEventDate(value) {
  if (!value) return "Día sin cargar";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR");
}

export default function RaceDirectionPage() {
  const supabase = useMemo(() => createClient(), []);
  const [season, setSeason] = useState(null);
  const [circuits, setCircuits] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [event, setEvent] = useState(null);
  const [races, setRaces] = useState([]);
  const [selectedCircuit, setSelectedCircuit] = useState("");
  const [selectedRound, setSelectedRound] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [editingEventData, setEditingEventData] = useState(false);
  const [eventHistory, setEventHistory] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [gridOrder, setGridOrder] = useState([]);
  const [racePhase, setRacePhase] = useState(null);
  const [editingRace, setEditingRace] = useState(null);
  const [raceType, setRaceType] = useState("sprint");
  const [gridMode, setGridMode] = useState("manual");
  const [qualifyingOrder, setQualifyingOrder] = useState([]);
  const [preparedGrid, setPreparedGrid] = useState([]);
  const [previousRaceId, setPreviousRaceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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

    const [
      { data: circuitData },
      { data: assignmentData },
      { data: openEvent },
      { data: historyData },
    ] = await Promise.all([
      supabase.from("circuits").select("*").eq("active", true).order("name"),
      supabase.from("season_driver_teams").select(`
        id,racing_number,active,
        driver:drivers(id,name,photo_transparent_url,active),
        team:teams(id,name,logo_url,primary_color,secondary_color,active)
      `).eq("season_id", activeSeason.id).eq("active", true).order("racing_number"),
      supabase.from("circuit_events").select("*,circuit:circuits(*)")
        .eq("season_id", activeSeason.id).eq("status", "open").limit(1).maybeSingle(),
      supabase.from("circuit_events").select("*,circuit:circuits(*),races(id)")
        .eq("season_id", activeSeason.id)
        .eq("status", "finalized")
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("finalized_at", { ascending: false }),
    ]);

    setCircuits(circuitData ?? []);
    setDrivers((assignmentData ?? []).filter(x => x.driver?.active && x.team?.active));
    setEventHistory(historyData ?? []);
    setEvent(openEvent ?? null);

    if (openEvent) {
      await loadEvent(openEvent.id, openEvent);
    } else {
      setSelectedCircuit("");
      setSelectedRound("");
      setSelectedDate(new Date().toISOString().slice(0, 10));
    }
    setMessage("");
  }

  async function loadEvent(eventId, eventData = null) {
    const [{ data: eventRows }, { data: participantRows }, { data: raceRows }] = await Promise.all([
      eventData ? Promise.resolve({ data: eventData }) :
        supabase.from("circuit_events").select("*,circuit:circuits(*)").eq("id", eventId).single(),
      supabase.from("event_participants").select("*").eq("event_id", eventId),
      supabase.from("races").select("*,race_results(*)").eq("event_id", eventId).order("race_number")
    ]);

    setEntries([]);
    setGridOrder([]);
    setQualifyingOrder([]);
    setRacePhase(null);
    setEditingRace(null);
    const nextType = suggestedType(raceRows ?? []);
    setRaceType(nextType);
    setGridMode(defaultGridMode(nextType, Boolean(raceRows?.length)));
    setPreviousRaceId(null);
    setEvent(eventRows);
    setSelectedCircuit(eventRows?.circuit_id ?? "");
    setSelectedRound(eventRows?.round_number?.toString() ?? "");
    setSelectedDate(eventRows?.event_date ?? "");
    setSelectedDrivers((participantRows ?? []).filter(x => x.active).map(x => x.driver_id));
    setRaces(raceRows ?? []);
  }

  async function openCircuit() {
    const roundNumber = Number(selectedRound);

    if (
      !season ||
      !selectedCircuit ||
      !selectedDate ||
      !Number.isInteger(roundNumber) ||
      roundNumber < 1 ||
      selectedDrivers.length < 2
    ) {
      setMessage("Completá número de fecha, día, circuito y al menos dos pilotos.");
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
      round_number: roundNumber,
      event_date: selectedDate,
      name: `Fecha ${roundNumber} · GP ${circuit.name}`,
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
    setRaceType("sprint");
    setGridMode("manual");
    openingRef.current = false;
    setOpening(false);
    setMessage("Circuito abierto.");
  }

  async function saveEventMetadata() {
    if (!event) return;

    const roundNumber = Number(selectedRound);
    if (!selectedCircuit || !selectedDate || !Number.isInteger(roundNumber) || roundNumber < 1) {
      setMessage("Completá número de fecha, día y circuito.");
      return;
    }

    const circuit = circuits.find((item) => item.id === selectedCircuit);
    if (!circuit) {
      setMessage("No se encontró el circuito seleccionado.");
      return;
    }

    if (event.circuit_id !== selectedCircuit && races.length) {
      const confirmed = window.confirm(
        `Este circuito ya tiene ${races.length} carrera${races.length === 1 ? "" : "s"}. ¿Cambiarlo a ${circuit.name} conservando los resultados?`
      );
      if (!confirmed) return;
    }

    const { data: updated, error } = await supabase
      .from("circuit_events")
      .update({
        circuit_id: selectedCircuit,
        round_number: roundNumber,
        event_date: selectedDate,
        name: `Fecha ${roundNumber} · GP ${circuit.name}`,
      })
      .eq("id", event.id)
      .select("*,circuit:circuits(*)")
      .single();

    if (error) {
      setMessage(`No se pudieron actualizar los datos: ${error.message}`);
      return;
    }

    setEvent(updated);
    if (updated.status === "finalized") await refreshEventHistory();
    setEditingEventData(false);
    setMessage("Fecha y circuito actualizados.");
  }

  function cancelEventMetadata() {
    setSelectedCircuit(event?.circuit_id ?? "");
    setSelectedRound(event?.round_number?.toString() ?? "");
    setSelectedDate(event?.event_date ?? "");
    setEditingEventData(false);
  }

  async function refreshEventHistory() {
    if (!season) return;

    const { data, error } = await supabase
      .from("circuit_events")
      .select("*,circuit:circuits(*),races(id)")
      .eq("season_id", season.id)
      .eq("status", "finalized")
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("finalized_at", { ascending: false });

    if (error) {
      setMessage(`No se pudo actualizar el archivo: ${error.message}`);
      return;
    }

    setEventHistory(data ?? []);
  }

  async function openSavedEvent(savedEvent) {
    await loadEvent(savedEvent.id, savedEvent);
    setEditingEventData(false);
    setMessage(`Viendo Fecha ${savedEvent.round_number || "—"} · ${savedEvent.circuit?.name || savedEvent.name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function backToCurrentEvent() {
    if (!season) return;

    const { data: openEvent, error } = await supabase
      .from("circuit_events")
      .select("*,circuit:circuits(*)")
      .eq("season_id", season.id)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage(`No se pudo volver a la jornada actual: ${error.message}`);
      return;
    }

    setEntries([]);
    setGridOrder([]);
    setRacePhase(null);
    setEditingRace(null);
    setEditingEventData(false);

    if (openEvent) {
      await loadEvent(openEvent.id, openEvent);
      setMessage("Volviste a la jornada abierta.");
    } else {
      setEvent(null);
      setRaces([]);
      setSelectedDrivers([]);
      setSelectedCircuit("");
      setSelectedRound("");
      setSelectedDate(new Date().toISOString().slice(0, 10));
      setMessage("No hay una jornada abierta.");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEntireEvent(targetEvent) {
    const eventLabel = `Fecha ${targetEvent.round_number || "—"} · ${targetEvent.circuit?.name || targetEvent.name}`;
    const confirmed = window.confirm(
      `¿Eliminar ${eventLabel}? Se borrarán todas sus carreras, resultados, DNF y puntos. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setMessage(`Eliminando ${eventLabel}...`);

    const { data: raceRows, error: raceReadError } = await supabase
      .from("races")
      .select("id")
      .eq("event_id", targetEvent.id);

    if (raceReadError) {
      setMessage(`No se pudieron leer las carreras: ${raceReadError.message}`);
      return;
    }

    const raceIds = (raceRows ?? []).map((race) => race.id);

    if (raceIds.length) {
      const [resultsDelete, startersDelete] = await Promise.all([
        supabase.from("race_results").delete().in("race_id", raceIds),
        supabase.from("race_starters").delete().in("race_id", raceIds),
      ]);

      const childError = resultsDelete.error || startersDelete.error;
      if (childError) {
        setMessage(`No se pudieron eliminar los resultados: ${childError.message}`);
        return;
      }

      const { error: raceDeleteError } = await supabase
        .from("races")
        .delete()
        .in("id", raceIds);

      if (raceDeleteError) {
        setMessage(`No se pudieron eliminar las carreras: ${raceDeleteError.message}`);
        return;
      }
    }

    const { error: participantDeleteError } = await supabase
      .from("event_participants")
      .delete()
      .eq("event_id", targetEvent.id);

    if (participantDeleteError) {
      setMessage(`No se pudieron eliminar los participantes: ${participantDeleteError.message}`);
      return;
    }

    const { error: eventDeleteError } = await supabase
      .from("circuit_events")
      .delete()
      .eq("id", targetEvent.id);

    if (eventDeleteError) {
      setMessage(`No se pudo eliminar la fecha: ${eventDeleteError.message}`);
      return;
    }

    await refreshEventHistory();

    if (event?.id === targetEvent.id) {
      await backToCurrentEvent();
    } else {
      setMessage(`${eventLabel} eliminada.`);
    }
  }

  async function prepareRace() {
    const active = drivers.filter(d => selectedDrivers.includes(d.driver.id));
    if (active.length < 2) {
      setMessage("Se necesitan al menos dos pilotos activos.");
      return;
    }
    let previousResults = null;
    const previousRace = races.at(-1);
    if (gridMode === "inverted") {
      if (!previousRace) {
        setMessage("No hay una carrera anterior para invertir la parrilla.");
        return;
      }
      if (raceType === "final" && !window.confirm(
        "La final normalmente larga según la clasificación a una vuelta. ¿Usar parrilla invertida de la carrera anterior de todos modos?"
      )) return;
      const { data, error } = await supabase.from("race_results")
        .select("driver_id,finish_position,status").eq("race_id", previousRace.id);
      if (error) { setMessage(`No se pudo preparar la parrilla: ${error.message}`); return; }
      previousResults = data;
    }
    let grid;
    try { grid = buildGrid(active, previousResults, gridMode); }
    catch (error) { setMessage(error.message); return; }
    setPreviousRaceId(gridMode === "inverted" ? previousRace.id : null);
    setPreparedGrid(grid.map(d => d.driver.id));
    // Qualifying is recorded independently, even when an inverted grid is selected.
    if (raceType === "sprint" || raceType === "final") grid = active;

    const prepared = grid.map((d, index) => ({
      driverId: d.driver.id,
      name: d.driver.name,
      photo: d.driver.photo_transparent_url,
      teamLogo: d.team.logo_url,
      status: "finished",
      position: index + 1,
      penalty: 0,
      pitStop: "",
    }));

    setGridOrder([]);
    setEntries(prepared);
    setQualifyingOrder([]);
    setRacePhase(["sprint", "final"].includes(raceType) ? "qualifying" : "grid");
    setEditingRace(null);
    setMessage(["sprint", "final"].includes(raceType)
      ? "Ordená el resultado de la clasificación y confirmalo. No otorga puntos."
      : "Revisá la parrilla y confirmala antes de cargar resultados.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function confirmQualifying() {
    setQualifyingOrder(entries.map(entry => entry.driverId));
    if (gridMode === "inverted") {
      const byId = new Map(entries.map(entry => [entry.driverId, entry]));
      setEntries(preparedGrid.map((id, index) => ({ ...byId.get(id), position: index + 1 })));
    }
    setRacePhase("grid");
    setMessage("Clasificación registrada. Revisá y confirmá la parrilla de salida.");
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

    let raceControl;
    // Legacy races retain their null metadata; editing scores must not relabel history.
    if (!editingRace || editingRace.race_control) {
      try {
        raceControl = makeRaceControl({ type: raceType, gridMode, qualifyingOrder,
          entries, previousRaceId });
      } catch (error) { setMessage(error.message); return; }
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const resultRows = entries.map((entry, index) => {
        const points = pointsFor(index + 1, entries.length, entry.status, entry.penalty);
        return {
          driver_id: entry.driverId,
          finish_position: index + 1,
          status: entry.status,
          base_points: points.base,
          penalty_points: Number(entry.penalty || 0),
          final_points: points.final,
        };
      });

      const { error: writeError } = await supabase.rpc("save_race_control", {
        p_event_id: event.id,
        p_race_id: editingRace?.id ?? null,
        p_control: raceControl ?? null,
        p_starters: gridOrder.map(driverId => ({ driver_id: driverId })),
        p_results: resultRows,
      });
      if (writeError) {
        setMessage(`No se guardó la carrera: ${writeError.message}`);
        return;
      }

      setEntries([]);
      setGridOrder([]);
      setRacePhase(null);
      setEditingRace(null);
      await loadEvent(event.id);
      if (event.status === "finalized") await refreshEventHistory();
      setMessage(editingRace ? "Carrera corregida." : "Carrera guardada.");
    } catch (error) {
      setMessage(`No se pudo guardar: ${error.message}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
        pitStop: race.race_control?.pit_stops?.[result.driver_id] ?? "",
      };
    }));
    setRaceType(race.race_control?.type ?? "standard");
    setGridMode(race.race_control?.grid_mode ?? "manual");
    setQualifyingOrder(race.race_control?.qualifying_order ?? []);
    setPreviousRaceId(race.race_control?.previous_race_id ?? null);
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
    if (event.status === "finalized") await refreshEventHistory();
    setMessage("Carrera eliminada.");
  }

  async function finalizeCircuit() {
    if (!event || !window.confirm("¿Finalizar este circuito y guardarlo en el historial?")) return;
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
    setEditingEventData(false);
    await boot();
    setMessage("Circuito finalizado y guardado en el historial.");
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

          <div className={styles.eventFields}>
            <label>N.º de fecha
              <input
                type="number"
                min="1"
                value={selectedRound}
                onChange={(e) => setSelectedRound(e.target.value)}
                placeholder="Ej.: 6"
              />
            </label>

            <label>Día de carrera
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
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
              <span>
                FECHA {event.round_number || "—"} · {event.status === "finalized" ? "FECHA GUARDADA" : "CIRCUITO ABIERTO"}
              </span>
              <h2>{event.circuit?.flag} {event.circuit?.name}</h2>
              <p>{event.circuit?.country} · {formatEventDate(event.event_date)} · {races.length} carreras cargadas</p>
            </div>
            <div className={styles.eventActions}>
              <button className={styles.editEventButton} onClick={() => setEditingEventData(true)}>EDITAR DATOS</button>
              {event.status === "finalized" ? (
                <>
                  <button className={styles.currentEventButton} onClick={backToCurrentEvent}>VOLVER A FECHA ACTUAL</button>
                  <button className={styles.deleteEventButton} onClick={() => deleteEntireEvent(event)}>ELIMINAR FECHA</button>
                </>
              ) : (
                <>
                  <button className={styles.deleteEventButton} onClick={() => deleteEntireEvent(event)}>ELIMINAR JORNADA</button>
                  <button onClick={finalizeCircuit}>FINALIZAR CIRCUITO</button>
                </>
              )}
            </div>
          </section>

          {editingEventData && (
            <section className={styles.editEventPanel}>
              <div className={styles.panelHead}>
                <div><span>CORREGIR JORNADA</span><h2>Fecha y circuito</h2></div>
                <button onClick={cancelEventMetadata}>Cancelar</button>
              </div>

              <div className={styles.eventFields}>
                <label>N.º de fecha
                  <input
                    type="number"
                    min="1"
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                  />
                </label>

                <label>Día de carrera
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </label>

                <label>Circuito
                  <select value={selectedCircuit} onChange={(e) => setSelectedCircuit(e.target.value)}>
                    {circuits.map(c => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
                  </select>
                </label>
              </div>

              <button className={styles.saveEventButton} onClick={saveEventMetadata}>GUARDAR DATOS DE LA FECHA</button>
            </section>
          )}

          {entries.length ? (
            <section className={styles.editor}>
              <div className={styles.panelHead}>
                <div>
                  <span>{racePhase === "qualifying" ? "CLASIFICACIÓN" : racePhase === "grid" ? "PARRILLA" : "RESULTADO"} · {RACE_TYPES[raceType]}</span>
                  <h2>
                    {editingRace
                      ? `Corregir Carrera ${editingRace.race_number}`
                      : racePhase === "qualifying" ? `Clasificación Carrera ${nextRaceNumber(races)}`
                      : racePhase === "grid"
                        ? `Parrilla Carrera ${nextRaceNumber(races)}`
                        : `Carrera ${nextRaceNumber(races)}`}
                  </h2>
                </div>
                <button onClick={() => {
                  setEntries([]);
                  setGridOrder([]);
                  setRacePhase(null);
                  setEditingRace(null);
                  const nextType = suggestedType(races);
                  setRaceType(nextType);
                  setGridMode(defaultGridMode(nextType, races.length > 0));
                }} disabled={saving}>Cancelar</button>
              </div>

              {racePhase === "qualifying" && <p>{raceType === "final" ? "Clasificación a una vuelta" : "Clasificación de aproximadamente 15 minutos"}: ordená a todos los pilotos de primero a último.</p>}
              {racePhase === "grid" && <p>Parrilla {gridMode === "inverted" ? "invertida del resultado anterior" : "manual / clasificación"}. Podés ajustar el orden antes de confirmar.</p>}
              {raceType === "final" && racePhase === "result" && <p>Verificación manual de la parada obligatoria para cada piloto. La aplicación no observa el videojuego ni aplica sanciones automáticas; usá la penalización habitual si corresponde.</p>}
              <div className={styles.resultList}>
                {entries.map((entry, index) => {
                  const pts = pointsFor(index + 1, entries.length, entry.status, entry.penalty);
                  return (
                    <article
                      key={entry.driverId}
                      className={racePhase === "result" && entry.status === "dnf" ? styles.dnf : ""}
                    >
                      <div className={styles.moveButtons}>
                        <button aria-label={`Subir a ${entry.name}`} onClick={() => move(index, -1)}>▲</button>
                        <button aria-label={`Bajar a ${entry.name}`} onClick={() => move(index, 1)}>▼</button>
                      </div>
                      <strong>
                        {racePhase === "result" && entry.status === "dnf" ? "DNF" : `${index + 1}°`}
                      </strong>
                      <img src={entry.teamLogo || ""} alt="" />
                      <img src={entry.photo || ""} alt={entry.name} />
                      <div>
                        <b>{entry.name}</b>
                        <small>
                          {racePhase !== "result"
                            ? (racePhase === "qualifying" ? "Posición de clasificación" : "Posición de largada")
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
                          {raceType === "final" && <label className={styles.pitStop}>Parada obligatoria · {entry.name}
                            <select aria-label={`Parada obligatoria de ${entry.name}`} value={entry.pitStop} onChange={e => patchEntry(entry.driverId, { pitStop: e.target.value })}>
                              <option value="">Pendiente de revisión</option>
                              {Object.entries(PIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>}
                        </>
                      ) : (
                        <>
                          <button disabled>{racePhase === "qualifying" ? "CLASIFICACIÓN" : "PARRILLA"}</button>
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
                disabled={saving}
                onClick={racePhase === "qualifying" ? confirmQualifying : racePhase === "grid" ? confirmGrid : saveRace}
              >
                {saving ? "GUARDANDO..." : racePhase === "qualifying" ? "CONFIRMAR CLASIFICACIÓN" : racePhase === "grid"
                  ? "CONFIRMAR PARRILLA"
                  : editingRace
                    ? "GUARDAR CORRECCIÓN"
                    : "GUARDAR RESULTADO"}
              </button>
            </section>
          ) : event.status !== "finalized" ? (
            <section className={styles.startPanel}>
              <h2>Preparar carrera {nextRaceNumber(races)}</h2>
              <p>Formato GP: clasificación ~15 min + sprint de 3 vueltas; cinco carreras de 5 vueltas con parrilla invertida; clasificación a una vuelta + final al 25% con parada obligatoria.</p>
              <label>Tipo de carrera
                <select value={raceType} onChange={e => {
                  setRaceType(e.target.value);
                  setGridMode(defaultGridMode(e.target.value, races.length > 0));
                }}>
                  {Object.entries(RACE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Parrilla de salida
                <select value={gridMode} onChange={e => setGridMode(e.target.value)}>
                  <option value="manual">Manual / según clasificación</option>
                  <option value="inverted" disabled={!races.length}>Invertida del resultado anterior</option>
                </select>
              </label>
              <button className={styles.openButton} onClick={prepareRace}>PREPARAR CARRERA {nextRaceNumber(races)}</button>
            </section>
          ) : (
            <div className={styles.archivedNotice}>
              Fecha archivada: podés corregir o eliminar las carreras cargadas desde el historial.
            </div>
          )}

          <section className={styles.history}>
            <div className={styles.panelHead}><div><span>HISTORIAL</span><h2>Carreras cargadas</h2></div><strong>{races.length}</strong></div>
            {!races.length && <p>Sin carreras todavía.</p>}
            {[...races].reverse().map(race => (
              <article key={race.id}>
                <div><span>CARRERA {race.race_number} · {RACE_TYPES[race.race_control?.type] ?? "Formato anterior (sin tipo registrado)"}</span>
                  {race.race_control && <details><summary>Parrilla, clasificación y controles</summary>
                    <p>Parrilla {race.race_control.grid_mode === "inverted" ? "invertida del resultado anterior" : "manual / clasificación"}</p>
                    {race.race_control.qualifying_order?.length > 0 && <><b>Clasificación</b><ol>{race.race_control.qualifying_order.map(id => <li key={id}>{drivers.find(d => d.driver.id === id)?.driver.name ?? id}</li>)}</ol></>}
                    {race.race_control.type === "final" && <><b>Parada obligatoria (revisión manual)</b><ul>{Object.entries(race.race_control.pit_stops ?? {}).map(([id, value]) => <li key={id}>{drivers.find(d => d.driver.id === id)?.driver.name ?? id}: {PIT_LABELS[value] ?? "Pendiente"}</li>)}</ul></>}
                  </details>}
                  <strong>{race.race_results?.find(r => r.status === "finished" && r.finish_position === 1)?.final_points ?? "—"} pts al ganador</strong></div>
                <div>
                  <button onClick={() => editRace(race)}>Corregir</button>
                  <button onClick={() => deleteRace(race)}>Eliminar</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      <section className={styles.eventHistory}>
        <div className={styles.panelHead}>
          <div><span>ARCHIVO</span><h2>Fechas guardadas</h2></div>
          <strong>{eventHistory.length}</strong>
        </div>

        <div className={styles.eventHistoryGrid}>
          {eventHistory.map((savedEvent) => (
            <article key={savedEvent.id}>
              <div className={styles.savedEventFlag}>{savedEvent.circuit?.flag || "🏁"}</div>
              <div>
                <span>FECHA {savedEvent.round_number || "—"}</span>
                <strong>{savedEvent.circuit?.name || savedEvent.name}</strong>
                <small>{formatEventDate(savedEvent.event_date)} · {savedEvent.races?.length ?? 0} carreras</small>
              </div>
              <div className={styles.savedEventActions}>
                <button type="button" onClick={() => openSavedEvent(savedEvent)}>Ver / editar</button>
                <button type="button" className={styles.archiveDeleteButton} onClick={() => deleteEntireEvent(savedEvent)}>Eliminar</button>
              </div>
            </article>
          ))}
          {!eventHistory.length && <p>Todavía no hay fechas finalizadas guardadas.</p>}
        </div>
      </section>
    </main>
  );
}
