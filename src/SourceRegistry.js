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
    
    // Clear sheet and write header once before importing all sources
    clearAndWriteTable_(SHEETS.RAW_IMPORTED_EVENTS, RAW_EVENT_COLUMNS, []);

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
          // Append data only (no headers) since we wrote header above
          const dataRows = rows.map(function (r) {
            return toRow_(RAW_EVENT_COLUMNS, r);
          });
          
          const ss = SpreadsheetApp.getActive();
          const sheet = ss.getSheetByName(SHEETS.RAW_IMPORTED_EVENTS);
          const lastRow = sheet.getLastRow();
          sheet.getRange(lastRow + 1, 1, dataRows.length, RAW_EVENT_COLUMNS.length).setValues(dataRows);
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
