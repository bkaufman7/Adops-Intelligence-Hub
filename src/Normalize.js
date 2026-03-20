function normalizeRawEvents_() {
  return withRunLogging_('normalizeRawEvents_', function () {
    const mapping = buildNetworkMap_();
    const rawRows = readTable_(SHEETS.RAW_IMPORTED_EVENTS);
    const deduped = dedupeExactFullRow_(rawRows);

    const normalizedRows = deduped.map(function (row) {
      return normalizeEventRow_(row, mapping);
    });

    clearAndWriteTable_(
      SHEETS.NORMALIZED_LEDGER,
      NORMALIZED_LEDGER_COLUMNS,
      normalizedRows.map(function (r) {
        return toRow_(NORMALIZED_LEDGER_COLUMNS, r);
      })
    );

    return { rawRows: rawRows.length, dedupedRows: deduped.length, normalizedRows: normalizedRows.length };
  });
}

function normalizeEventRow_(row, mapping) {
  const eventDate = parseDateSafe_(row['Event Date']);
  const networkId = String(row['Network ID'] || '').trim();
  const networkNameRaw = String(row['Network Name'] || '').trim();
  const mapHit = mapping['id:' + networkId] || mapping['name:' + networkNameRaw.toLowerCase()] || {};

  if (!mapHit['Network ID'] && !mapHit['Network Name']) {
    logRun_('normalizeEventRow_', RUN_STATUS.WARNING, 'Mapping not found', { networkId: networkId, networkName: networkNameRaw });
  }

  return {
    'Event Date': eventDate || row['Event Date'],
    'Event Week': eventDate ? formatWeek_(eventDate) : '',
    'Event Month': eventDate ? Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'yyyy-MM') : '',
    'Source System': row['Source System'],
    'Source Project': row['Source Project'],
    'Network ID': networkId,
    'Network Name': row['Network Name'] || mapHit['Network Name'] || '',
    'Advertiser': row['Advertiser'] || mapHit['Advertiser'] || '',
    'Campaign': row['Campaign'] || '',
    'Placement ID': row['Placement ID'] || '',
    'Placement Name': row['Placement Name'] || '',
    'Issue Type': row['Issue Type Raw'] || '',
    'Issue Flags': row['Issue Flags'] || '',
    'Issue Detail': row['Issue Detail'] || '',
    'Impressions': row['Impressions'] || '',
    'Clicks': row['Clicks'] || '',
    'Difference %': row['Difference %'] || '',
    'Account REP OPS': mapHit['Account REP OPS'] || '',
    'Source Email Link': row['Source Email Link'] || '',
    'Source File Link': row['Source File Link'] || '',
    'Full Row Hash': row['Full Row Hash'] || '',
    'Imported At': row['Import Timestamp'] || new Date()
  };
}

function parseDateSafe_(value) {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatWeek_(dateObj) {
  const tmp = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return tmp.getUTCFullYear() + '-W' + ('0' + weekNo).slice(-2);
}
