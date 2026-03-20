function computeFullRowHash_(eventRow) {
  const payload = RAW_EVENT_COLUMNS.map(function (col) {
    if (col === 'Full Row Hash') {
      return '';
    }
    return String(eventRow[col] !== undefined ? eventRow[col] : '');
  }).join('||');

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest);
}

function dedupeExactFullRow_(events) {
  const seen = {};
  const deduped = [];

  events.forEach(function (row) {
    const hash = row['Full Row Hash'] || computeFullRowHash_(row);
    if (seen[hash]) {
      return;
    }
    seen[hash] = true;
    row['Full Row Hash'] = hash;
    deduped.push(row);
  });

  return deduped;
}
