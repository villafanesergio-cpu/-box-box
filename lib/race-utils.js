export const STORAGE_KEY = "boxbox-race-control-v1";
export const LIVE_CHANNEL = "boxbox-live-v1";

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function pointsForEntry(entry, index, totalStarters) {
  if (entry.status === "dnf") return { basePoints: 0, points: 0 };
  const basePoints = Math.max(totalStarters - index, 0);
  return {
    basePoints,
    points: Math.max(basePoints + Number(entry.penalty || 0), 0)
  };
}

export function isResultOrderValid(entries) {
  let dnfStarted = false;
  for (const entry of entries) {
    if (entry.status === "dnf") dnfStarted = true;
    if (entry.status !== "dnf" && dnfStarted) return false;
  }
  return entries.length >= 2;
}

export function buildRaceResult(entries) {
  return entries.map((entry, index) => {
    const points = pointsForEntry(entry, index, entries.length);
    return {
      driver: entry.driver,
      position: index + 1,
      status: entry.status,
      penalty: entry.status === "dnf" ? 0 : Number(entry.penalty || 0),
      ...points
    };
  });
}

export function nextGridFromRace(race, selectedDrivers = null) {
  if (!race) return selectedDrivers || [];
  const reversed = [...race.results].reverse().map((result) => result.driver);
  if (!selectedDrivers) return reversed;
  const returning = reversed.filter((driver) => selectedDrivers.includes(driver));
  const newcomers = selectedDrivers.filter((driver) => !returning.includes(driver));
  return [...returning, ...newcomers];
}

export function calculateCircuitStandings(races = []) {
  const stats = new Map();

  for (const race of races) {
    for (const result of race.results) {
      if (!stats.has(result.driver)) {
        stats.set(result.driver, {
          driver: result.driver,
          points: 0,
          wins: 0,
          podiums: 0,
          dnf: 0,
          starts: 0,
          lastResult: 999
        });
      }
      const row = stats.get(result.driver);
      row.points += result.points;
      row.starts += 1;
      row.lastResult = result.status === "dnf" ? 999 : result.position;
      if (result.status === "dnf") row.dnf += 1;
      if (result.status !== "dnf" && result.position === 1) row.wins += 1;
      if (result.status !== "dnf" && result.position <= 3) row.podiums += 1;
    }
  }

  return [...stats.values()].sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.podiums - a.podiums ||
    a.dnf - b.dnf ||
    a.lastResult - b.lastResult ||
    a.driver.localeCompare(b.driver, "es")
  );
}

export function calculateWorldStandings(baseDrivers = [], sessions = []) {
  const table = new Map(baseDrivers.map((driver) => [driver.nombre, {
    ...driver,
    puntosBase: driver.puntos,
    puntosNuevos: 0,
    dnfNuevos: 0,
    victoriasCarrera: 0
  }]));

  for (const session of sessions) {
    for (const race of session.races || []) {
      for (const result of race.results) {
        if (!table.has(result.driver)) continue;
        const row = table.get(result.driver);
        row.puntosNuevos += result.points;
        if (result.status === "dnf") row.dnfNuevos += 1;
        if (result.status !== "dnf" && result.position === 1) row.victoriasCarrera += 1;
      }
    }
  }

  return [...table.values()]
    .map((row) => ({
      ...row,
      puntos: row.puntosBase + row.puntosNuevos,
      dnfTotal: row.dnf + row.dnfNuevos
    }))
    .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, "es"));
}

export function getLiveComments(session, standings) {
  if (!session) return ["Race Control está esperando que se abra un circuito."];
  if (!session.races?.length) {
    return [
      `${session.circuit.bandera} ${session.circuit.nombre} está listo para recibir la primera carrera.`,
      "Todavía no hay puntos: cualquier pronóstico es puro humo.",
      "La primera carrera define la primera parrilla invertida."
    ];
  }

  const leader = standings[0];
  const second = standings[1];
  const totalDnf = standings.reduce((sum, row) => sum + row.dnf, 0);
  const gap = leader && second ? leader.points - second.points : 0;
  const comments = [
    `${leader.driver} manda en ${session.circuit.nombre} con ${leader.points} puntos.`,
    second ? `${second.driver} está a ${gap} punto${gap === 1 ? "" : "s"} del liderazgo.` : "Todavía no hay escolta.",
    totalDnf ? `Ya se registraron ${totalDnf} DNF en este circuito.` : "Por ahora, nadie visitó el club del DNF.",
    leader.wins > 1 ? `${leader.driver} ya ganó ${leader.wins} carreras en este circuito.` : "La pelea por las victorias sigue abierta."
  ];

  if (session.finalized && leader) comments.unshift(`${leader.driver} es el ganador del circuito ${session.circuit.nombre}.`);
  return comments;
}
