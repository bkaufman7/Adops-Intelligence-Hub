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
    const failed = [];

    sources.forEach(function (sourceCfg) {
      const adapter = getSourceAdapter_(sourceCfg.sourceSystem);
      if (!adapter) {
        logRun_('importFromConfiguredSources_', RUN_STATUS.WARNING, 'No adapter for source', sourceCfg);
        failed.push({ source: sourceCfg.sourceSystem, error: 'No adapter for source' });
        return;
      }

      try {
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
      } catch (err) {
        const message = String(err);
        failed.push({ source: sourceCfg.sourceSystem, error: message });
        logRun_('importFromConfiguredSources_', RUN_STATUS.WARNING, 'Source import failed', {
          sourceSystem: sourceCfg.sourceSystem,
          spreadsheetId: sourceCfg.spreadsheetId || '',
          exportTab: sourceCfg.exportTab || '',
          error: message
        });
      }
    });

    return { imported: imported, failed: failed };
  });
}
