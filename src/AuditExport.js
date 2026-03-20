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

function initializeHubDriveFolders() {
  return withRunLogging_('initializeHubDriveFolders', function () {
    const folders = initializeHubDriveFolders_();
    return {
      rootFolderId: folders.rootFolder.getId(),
      auditDetailFolderId: folders.auditDetailFolder.getId(),
      weeklySummaryFolderId: folders.weeklySummaryFolder.getId(),
      backfillFolderId: folders.backfillFolder.getId(),
      sourceArchivesFolderId: folders.sourceArchivesFolder.getId()
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

  return {
    rootFolder: rootFolder,
    auditDetailFolder: auditDetailFolder,
    weeklySummaryFolder: weeklySummaryFolder,
    backfillFolder: backfillFolder,
    sourceArchivesFolder: sourceArchivesFolder
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
