/**
 * CrossEnrichService.js
 *
 * After all sources are normalized into Normalized_Event_Ledger, this service
 * annotates each row with signals from sibling source systems that share a
 * common identifier (Placement ID first, then Network ID + Event Month).
 *
 * Join key priority:
 *   1. Placement ID  – exact, most specific
 *   2. Network ID + Event Month – network-level signal when no placement match
 *
 * Columns populated:
 *   Also Flagged By          – comma-separated source systems that also flagged this record
 *   Cross Source Issue Flags – "SourceSystem: flags" per sibling source, pipe-separated
 *   Cross Source Join Level  – "placement" | "network-month" | "" (no match)
 */

function crossEnrichLedger_() {
  return withRunLogging_('crossEnrichLedger_', function () {
    if (NORMALIZED_LEDGER_COLUMNS.indexOf('Also Flagged By') === -1) {
      return { total: 0, enriched: 0, skipped: true, reason: 'Lean ledger mode does not include cross-enrichment columns' };
    }

    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    if (!rows || rows.length === 0) return { total: 0, enriched: 0 };

    // ── Build indices ────────────────────────────────────────────────────────

    // placementIndex[placementId] = [ { sourceSystem, issueFlags } ... ]
    var placementIndex = {};
    // networkMonthIndex["networkId|yyyy-MM"] = [ { sourceSystem, issueFlags } ... ]
    var networkMonthIndex = {};

    rows.forEach(function (row) {
      var pid   = String(row['Placement ID']  || '').trim();
      var nid   = String(row['Network ID']    || '').trim();
      var month = String(row['Event Month']   || '').trim();
      var entry = {
        sourceSystem: row['Source System'] || '',
        issueFlags:   row['Issue Flags']   || ''
      };

      if (pid) {
        if (!placementIndex[pid]) placementIndex[pid] = [];
        placementIndex[pid].push(entry);
      }

      if (nid && month) {
        var key = nid + '|' + month;
        if (!networkMonthIndex[key]) networkMonthIndex[key] = [];
        networkMonthIndex[key].push(entry);
      }
    });

    // ── Enrich each row ──────────────────────────────────────────────────────

    var enrichedCount = 0;

    var enrichedRows = rows.map(function (row) {
      var pid        = String(row['Placement ID'] || '').trim();
      var nid        = String(row['Network ID']   || '').trim();
      var month      = String(row['Event Month']  || '').trim();
      var thisSource = row['Source System'] || '';

      // Placement-level siblings from a different source system
      var placementSiblings = pid
        ? (placementIndex[pid] || []).filter(function (e) { return e.sourceSystem !== thisSource; })
        : [];

      // Network+month-level siblings — only used if no placement match found
      var networkSiblings = (placementSiblings.length === 0 && nid && month)
        ? (networkMonthIndex[nid + '|' + month] || []).filter(function (e) { return e.sourceSystem !== thisSource; })
        : [];

      var siblings   = placementSiblings.length > 0 ? placementSiblings : networkSiblings;
      var joinLevel  = placementSiblings.length > 0 ? 'placement'
                      : networkSiblings.length  > 0 ? 'network-month'
                      : '';

      // Unique sibling source systems (preserve first-seen order)
      var siblingSourceSystems = [];
      siblings.forEach(function (e) {
        if (siblingSourceSystems.indexOf(e.sourceSystem) === -1) {
          siblingSourceSystems.push(e.sourceSystem);
        }
      });

      // "SourceSystem: flag1, flag2" per sibling source, joined by " | "
      var crossFlagParts = [];
      siblingSourceSystems.forEach(function (src) {
        var flags = siblings
          .filter(function (e) { return e.sourceSystem === src; })
          .map(function (e) { return e.issueFlags; })
          .filter(Boolean)
          .join(', ');
        if (flags) crossFlagParts.push(src + ': ' + flags);
      });

      row['Also Flagged By']          = siblingSourceSystems.join(', ');
      row['Cross Source Issue Flags'] = crossFlagParts.join(' | ');
      row['Cross Source Join Level']  = joinLevel;

      if (siblingSourceSystems.length > 0) enrichedCount++;
      return row;
    });

    // ── Write back ───────────────────────────────────────────────────────────

    clearAndWriteTable_(
      SHEETS.NORMALIZED_LEDGER,
      NORMALIZED_LEDGER_COLUMNS,
      enrichedRows.map(function (r) { return toRow_(NORMALIZED_LEDGER_COLUMNS, r); })
    );

    return { total: rows.length, enriched: enrichedCount };
  });
}
