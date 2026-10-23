export const RACE_TYPES = {
  sprint: 'Fase 1 · Sprint · 3 vueltas',
  short: 'Fase 2 · Carrera corta · 5 vueltas',
  final: 'Fase 3 · Final · 25% · parada obligatoria',
  standard: 'Carrera libre / formato anterior',
};

export const PIT_LABELS = { yes: 'Cumplió', no: 'No cumplió' };

// Keep the championship's existing scoring, including DNF and manual penalties.
export function pointsFor(position, starters, status, penalty) {
  if (status === 'dnf') return { base: 0, final: 0 };
  const base = Math.max(starters - position + 1, 1);
  return { base, final: Math.max(base + Number(penalty || 0), 0) };
}

export function nextRaceNumber(races) {
  return Math.max(0, ...races.map(race => race.race_number)) + 1;
}

export function suggestedType(races) {
  if (!races.length) return 'sprint';
  if (races.some(race => !race.race_control)) return 'standard';
  if (!races.some(race => race.race_control.type === 'sprint')) return 'sprint';
  if (races.filter(race => race.race_control.type === 'short').length < 5) return 'short';
  return races.some(race => race.race_control.type === 'final') ? 'standard' : 'final';
}

export function defaultGridMode(type, hasPreviousRace) {
  return type === 'short' && hasPreviousRace ? 'inverted' : 'manual';
}

export function buildGrid(active, previousResults, mode) {
  if (mode === 'manual') return [...active];
  if (mode !== 'inverted' || !previousResults?.length) {
    throw new Error('La parrilla invertida requiere resultados de una carrera anterior.');
  }
  const activeById = new Map(active.map(driver => [driver.driver.id, driver]));
  const ordered = [...previousResults]
    .sort((a, b) => (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity))
    .map(result => activeById.get(result.driver_id)).filter(Boolean);
  const included = new Set(ordered.map(driver => driver.driver.id));
  return ordered.reverse().concat(active.filter(driver => !included.has(driver.driver.id)));
}

export function makeRaceControl({ type, gridMode, qualifyingOrder, entries, previousRaceId }) {
  if (!Object.hasOwn(RACE_TYPES, type)) throw new Error('Seleccioná el tipo de carrera.');
  if (!['manual', 'inverted'].includes(gridMode)) throw new Error('Seleccioná el modo de parrilla.');
  if (gridMode === 'inverted' && !previousRaceId) throw new Error('Falta la carrera de origen de la parrilla.');
  if (type === 'sprint' || type === 'final') {
    const ids = new Set(entries.map(entry => entry.driverId));
    if (qualifyingOrder.length !== ids.size || new Set(qualifyingOrder).size !== ids.size ||
        qualifyingOrder.some(id => !ids.has(id))) {
      throw new Error('Registrá y confirmá la clasificación de todos los pilotos.');
    }
  }
  if (type === 'final' && entries.some(entry => !Object.hasOwn(PIT_LABELS, entry.pitStop))) {
    throw new Error('Revisá manualmente la parada obligatoria de cada piloto, incluidos los DNF.');
  }
  return {
    version: 1,
    type,
    grid_mode: gridMode,
    previous_race_id: gridMode === 'inverted' ? previousRaceId : null,
    qualifying_order: ['sprint', 'final'].includes(type) ? [...qualifyingOrder] : [],
    pit_stops: type === 'final'
      ? Object.fromEntries(entries.map(entry => [entry.driverId, entry.pitStop])) : {},
  };
}
