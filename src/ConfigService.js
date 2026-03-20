function getConfigMap_() {
  const rows = readTable_(SHEETS.CONFIG);
  const map = {};

  rows.forEach(function (row) {
    const key = String(row.Key || '').trim();
    const value = row.Value;
    if (key) {
      map[key] = value;
    }
  });

  return map;
}

function getConfigValue_(key, fallback) {
  const map = getConfigMap_();
  return map[key] !== undefined && map[key] !== '' ? map[key] : fallback;
}

function getEnabledSources_() {
  const map = getConfigMap_();
  return Object.keys(map)
    .filter(function (key) {
      return key.indexOf(CONFIG_KEYS.SOURCE_PREFIX) === 0;
    })
    .map(function (key) {
      const payload = map[key];
      if (!payload) {
        return null;
      }
      try {
        const parsed = JSON.parse(payload);
        return parsed.enabled ? parsed : null;
      } catch (err) {
        logRun_('getEnabledSources_', RUN_STATUS.WARNING, 'Invalid source config JSON', { key: key, payload: payload });
        return null;
      }
    })
    .filter(function (item) {
      return item !== null;
    });
}
