function getSourceAdapter_(sourceSystem) {
  const adapters = {};
  adapters[SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT] = importProject1Rows_;
  adapters[SOURCE_SYSTEMS.PROJECT_2_CVI] = importProject2Rows_;
  adapters[SOURCE_SYSTEMS.PROJECT_3_EOM] = importProject3Rows_;
  return adapters[sourceSystem];
}

function importFromConfiguredSources_() {
  return withRunLogging_('importFromConfiguredSources_', function () {
    const sources = getEnabledSources_();
    const imported = [];

    sources.forEach(function (sourceCfg) {
      const adapter = getSourceAdapter_(sourceCfg.sourceSystem);
      if (!adapter) {
        logRun_('importFromConfiguredSources_', RUN_STATUS.WARNING, 'No adapter for source', sourceCfg);
        return;
      }

      const rows = adapter(sourceCfg);
      if (rows.length) {
        appendRows_(
          SHEETS.RAW_IMPORTED_EVENTS,
          [RAW_EVENT_COLUMNS],
          rows.map(function (r) {
            return toRow_(RAW_EVENT_COLUMNS, r);
          })
        );
      }

      imported.push({ source: sourceCfg.sourceSystem, rowCount: rows.length });
    });

    return { imported: imported };
  });
}
