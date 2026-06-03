function exportAuditDetail() {
  return withRunLogging_('exportAuditDetail', function () {
    const folderId = String(getConfigValue_(CONFIG_KEYS.AUDIT_EXPORT_FOLDER_ID, '') || '').trim();
    if (!folderId) {
      throw new Error('Config missing audit_export_folder_id');
    }

    const rows = readTable_(SHEETS.NORMALIZED_LEDGER);
    const headers = NORMALIZED_LEDGER_COLUMNS;
    const csv = toCsv_(headers, rows);

    const folders = initializeHubDriveFolders_();
    const folder = folders.auditDetailFolder;

    const fileName = 'adops_intelligence_audit_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.csv';
    const file = folder.createFile(fileName, csv, MimeType.CSV);

    return { fileName: file.getName(), fileId: file.getId() };
  });
}

function exportPopulatedDataSnapshot() {
  return withRunLogging_('exportPopulatedDataSnapshot', function () {
    const folders = initializeHubDriveFolders_();
    const snapshotFolder = ensureSubfolder_(folders.rootFolder, HUB_FOLDERS.DATA_SNAPSHOTS);
    const ss = SpreadsheetApp.getActive();
    const allSheets = ss.getSheets();
    const exportedAt = new Date();
    const timestamp = Utilities.formatDate(exportedAt, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');

    const snapshot = {
      exportedAt: exportedAt.toISOString(),
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      timeZone: ss.getSpreadsheetTimeZone(),
      sheets: []
    };

    const csvBlobs = [];
    let exportedSheetCount = 0;
    let exportedRowCount = 0;

    allSheets.forEach(function (sheet) {
      const values = sheet.getDataRange().getValues();
      if (!values || !values.length) {
        return;
      }

      const headerRow = values[0] || [];
      const headers = headerRow.map(function (header, idx) {
        return normalizeSnapshotHeader_(header, idx);
      });

      const populatedRows = values.slice(1).filter(function (row) {
        return !isBlankRowValues_(row);
      });

      if (!populatedRows.length) {
        return;
      }

      const rowsAsObjects = populatedRows.map(function (row) {
        const obj = {};
        headers.forEach(function (header, idx) {
          obj[header] = snapshotValue_(row[idx]);
        });
        return obj;
      });

      snapshot.sheets.push({
        sheetName: sheet.getName(),
        columnCount: headers.length,
        rowCount: rowsAsObjects.length,
        headers: headers,
        rows: rowsAsObjects
      });

      const csv = toCsvRows_(headers, populatedRows);
      csvBlobs.push(Utilities.newBlob(csv, MimeType.CSV, sanitizeSheetName_(sheet.getName()) + '.csv'));

      exportedSheetCount++;
      exportedRowCount += rowsAsObjects.length;
    });

    if (!snapshot.sheets.length) {
      throw new Error('No populated data rows found to export.');
    }

    const baseName = 'adops_intelligence_full_snapshot_' + timestamp;
    const jsonBlob = Utilities.newBlob(JSON.stringify(snapshot, null, 2), MimeType.PLAIN_TEXT, baseName + '.json');
    const jsonFile = snapshotFolder.createFile(jsonBlob);
    const zipBlob = Utilities.zip(csvBlobs, baseName + '_csv.zip');
    const zipFile = snapshotFolder.createFile(zipBlob);

    return {
      folderId: snapshotFolder.getId(),
      folderName: snapshotFolder.getName(),
      jsonFileId: jsonFile.getId(),
      jsonFileName: jsonFile.getName(),
      csvZipFileId: zipFile.getId(),
      csvZipFileName: zipFile.getName(),
      exportedSheets: exportedSheetCount,
      exportedRows: exportedRowCount
    };
  });
}

function initializeHubDriveFolders() {
  return withRunLogging_('initializeHubDriveFolders', function () {
    const folders = initializeHubDriveFolders_();
    return {
      rootFolderId: folders.rootFolder.getId(),
      auditDetailFolderId: folders.auditDetailFolder.getId(),
      weeklySummaryFolderId: folders.weeklySummaryFolder.getId(),
      backfillFolderId: folders.backfillFolder.getId(),
      sourceArchivesFolderId: folders.sourceArchivesFolder.getId(),
      dataSnapshotsFolderId: folders.dataSnapshotsFolder.getId()
    };
  });
}

function initializeHubDriveFolders_() {
  const folderId = String(getConfigValue_(CONFIG_KEYS.AUDIT_EXPORT_FOLDER_ID, '') || '').trim();
  if (!folderId) {
    throw new Error('Config missing audit_export_folder_id');
  }

  const rootFolder = DriveApp.getFolderById(folderId);
  const auditDetailFolder = ensureSubfolder_(rootFolder, HUB_FOLDERS.AUDIT_DETAIL_EXPORTS);
  const weeklySummaryFolder = ensureSubfolder_(rootFolder, HUB_FOLDERS.WEEKLY_SUMMARY_EXPORTS);
  const backfillFolder = ensureSubfolder_(rootFolder, HUB_FOLDERS.BACKFILL_EXPORTS);
  const sourceArchivesFolder = ensureSubfolder_(rootFolder, HUB_FOLDERS.SOURCE_ARCHIVES);
  const dataSnapshotsFolder = ensureSubfolder_(rootFolder, HUB_FOLDERS.DATA_SNAPSHOTS);

  return {
    rootFolder: rootFolder,
    auditDetailFolder: auditDetailFolder,
    weeklySummaryFolder: weeklySummaryFolder,
    backfillFolder: backfillFolder,
    sourceArchivesFolder: sourceArchivesFolder,
    dataSnapshotsFolder: dataSnapshotsFolder
  };
}

function ensureSubfolder_(parentFolder, name) {
  const existing = parentFolder.getFoldersByName(name);
  if (existing.hasNext()) {
    return existing.next();
  }
  return parentFolder.createFolder(name);
}

function toCsv_(headers, rows) {
  const escaped = function (value) {
    const s = String(value !== undefined && value !== null ? value : '');
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [];
  lines.push(headers.map(escaped).join(','));
  rows.forEach(function (row) {
    lines.push(headers.map(function (h) { return escaped(row[h]); }).join(','));
  });
  return lines.join('\n');
}

function toCsvRows_(headers, rows) {
  const escaped = function (value) {
    const s = String(value !== undefined && value !== null ? value : '');
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [];
  lines.push(headers.map(escaped).join(','));
  rows.forEach(function (row) {
    lines.push(headers.map(function (_, idx) {
      return escaped(row[idx]);
    }).join(','));
  });

  return lines.join('\n');
}

function isBlankRowValues_(row) {
  if (!row || !row.length) {
    return true;
  }

  for (var idx = 0; idx < row.length; idx++) {
    const value = row[idx];
    if (value instanceof Date) {
      return false;
    }
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return false;
    }
  }

  return true;
}

function normalizeSnapshotHeader_(header, idx) {
  const normalized = String(header !== undefined && header !== null ? header : '').trim();
  if (normalized) {
    return normalized;
  }
  return 'Column_' + String(idx + 1);
}

function sanitizeSheetName_(name) {
  const safe = String(name || '').replace(/[^A-Za-z0-9._-]/g, '_');
  return safe || 'Sheet';
}

function snapshotValue_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
