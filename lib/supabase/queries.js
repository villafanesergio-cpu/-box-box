export async function getActiveSeason(supabase) {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, year, active")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTeams(supabase, { activeOnly = false } = {}) {
  let query = supabase
    .from("teams")
    .select("id, name, logo_url, primary_color, secondary_color, active")
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDriversForSeason(
  supabase,
  seasonId,
  { activeOnly = false } = {}
) {
  if (!seasonId) return [];

  let query = supabase
    .from("season_driver_teams")
    .select(`
      id,
      racing_number,
      active,
      team:teams (
        id,
        name,
        logo_url,
        primary_color,
        secondary_color,
        active
      ),
      driver:drivers (
        id,
        name,
        driving_style,
        custom_driving_style,
        photo_background_url,
        photo_transparent_url,
        face_photo_url,
        celebration_media_url,
        active
      )
    `)
    .eq("season_id", seasonId)
    .order("racing_number", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.driver && row.team)
    .filter((row) => !activeOnly || (row.driver.active && row.team.active))
    .map((row) => ({
      assignmentId: row.id,
      number: row.racing_number,
      active: row.active,
      driverId: row.driver.id,
      name: row.driver.name,
      drivingStyle:
        row.driver.custom_driving_style || row.driver.driving_style,
      photoBackgroundUrl: row.driver.photo_background_url,
      photoTransparentUrl: row.driver.photo_transparent_url,
      facePhotoUrl: row.driver.face_photo_url,
      celebrationMediaUrl: row.driver.celebration_media_url,
      teamId: row.team.id,
      teamName: row.team.name,
      teamLogoUrl: row.team.logo_url,
      teamPrimaryColor: row.team.primary_color,
      teamSecondaryColor: row.team.secondary_color,
    }));
}

export async function getBoxBoxSetup(supabase) {
  const season = await getActiveSeason(supabase);

  if (!season) {
    return {
      season: null,
      teams: [],
      drivers: [],
    };
  }

  const [teams, drivers] = await Promise.all([
    getTeams(supabase, { activeOnly: true }),
    getDriversForSeason(supabase, season.id, { activeOnly: true }),
  ]);

  return { season, teams, drivers };
}
