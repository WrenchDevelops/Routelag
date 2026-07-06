/* global RouteLagNormalizer */
(function (global) {
  function safeParse(value) {
    if (value == null || value === "") return undefined;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  function asNumber(value) {
    if (value == null || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  function asBool(value) {
    if (value === true || value === "True" || value === "true" || value === 1 || value === "1") {
      return true;
    }
    if (value === false || value === "False" || value === "false" || value === 0 || value === "0") {
      return false;
    }
    return undefined;
  }

  function normalizeInfoUpdate(current, info) {
    const next = { ...current };
    if (!info || typeof info !== "object") return next;

    if (info.game_info) {
      const matchStarted =
        asBool(info.game_info.match_started) ?? asBool(info.game_info.matchStarted);
      if (matchStarted != null) next.matchActive = matchStarted;
    }

    if (info.phase) {
      const phase = safeParse(info.phase);
      if (typeof phase === "string") next.phase = phase;
      else if (phase && typeof phase === "object") {
        next.phase = phase.phase || phase.name || phase.state || next.phase;
      }
    }

    if (info.me) {
      const me = safeParse(info.me) || {};
      next.health = asNumber(me.health ?? me.hp) ?? next.health;
      next.shield = asNumber(me.shield ?? me.shields) ?? next.shield;
    }

    if (info.counters) {
      const counters = safeParse(info.counters) || {};
      next.kills = asNumber(counters.kills) ?? next.kills;
      next.assists = asNumber(counters.assists) ?? next.assists;
      next.deaths = asNumber(counters.deaths) ?? next.deaths;
      next.placement = asNumber(counters.placement ?? counters.rank) ?? next.placement;
    }

    if (info.rank) {
      const rank = safeParse(info.rank) || {};
      next.placement = asNumber(rank.rank ?? rank.placement) ?? next.placement;
    }

    if (info.match_info) {
      const matchInfo = safeParse(info.match_info) || {};
      next.matchMode = matchInfo.mode || matchInfo.matchMode || next.matchMode;
      next.totalPlayers = asNumber(matchInfo.total_players ?? matchInfo.totalPlayers) ?? next.totalPlayers;
      next.totalTeams = asNumber(matchInfo.total_teams ?? matchInfo.totalTeams) ?? next.totalTeams;
    }

    if (info.items) {
      next.inventory = safeParse(info.items);
    }

    if (info.location) {
      next.location = safeParse(info.location);
    }

    // Materials / damage / zone timers are only set when GEP actually provides them.
    return next;
  }

  function normalizeGameEvents(current, events) {
    const next = { ...current };
    const list = Array.isArray(events) ? events : [];

    for (const event of list) {
      if (!event || !event.name) continue;
      const data = safeParse(event.data) || {};
      const name = String(event.name);

      if (name === "kill") {
        next.kills = asNumber(data.count) ?? (next.kills != null ? next.kills + 1 : 1);
      }
      if (name === "death") {
        next.deaths = asNumber(data.count) ?? (next.deaths != null ? next.deaths + 1 : 1);
      }
      if (name === "assist") {
        next.assists = asNumber(data.count) ?? (next.assists != null ? next.assists + 1 : 1);
      }
      if (name === "matchStart" || name === "match_start") {
        next.matchActive = true;
      }
      if (name === "matchEnd" || name === "match_end") {
        next.matchActive = false;
      }
    }

    return next;
  }

  function toTelemetryPayload(state) {
    return {
      source: "routelag-hud-companion",
      game: "fortnite",
      type: "hud_update",
      timestamp: Date.now(),
      data: {
        connected: Boolean(state.connected),
        fortniteDetected: Boolean(state.fortniteDetected),
        matchActive: Boolean(state.matchActive),
        phase: state.phase,
        health: state.health,
        shield: state.shield,
        kills: state.kills,
        deaths: state.deaths,
        assists: state.assists,
        placement: state.placement,
        matchMode: state.matchMode,
        totalPlayers: state.totalPlayers,
        totalTeams: state.totalTeams,
        inventory: state.inventory,
        location: state.location,
        materials: state.materials,
        ping: state.ping,
        lastUpdateAt: state.lastUpdateAt,
      },
    };
  }

  global.RouteLagNormalizer = {
    normalizeInfoUpdate,
    normalizeGameEvents,
    toTelemetryPayload,
  };
})(this);
