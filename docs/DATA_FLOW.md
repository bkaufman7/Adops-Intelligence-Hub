# AdOps Intelligence Hub Data Flow Architecture

**Last Updated:** March 30, 2026

---

## Full Refresh Workflow (runFullRefresh)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Refresh Source Exports (refreshSourceExports)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │  Project 1   │      │  Project 2   │      │  Project 3   │ │
│  │  CM360 Audit │      │  Daily CVI   │      │  EOM Tracker │ │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘ │
│         │                     │                     │          │
│         └─────────────────────┴─────────────────────┘          │
│                               │                                │
│                               ▼                                │
│                    ┌────────────────────────┐                  │
│                    │  Raw_Imported_Events   │                  │
│                    │  (All source data in   │                  │
│                    │   standardized schema) │                  │
│                    └────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Run All Summaries (runAllSummaries)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  A. normalizeRawEvents_()                                       │
│     ┌────────────────────────┐     ┌──────────────────┐        │
│     │  Raw_Imported_Events   │     │ Network_Mapping  │        │
│     │  (dedupe by hash)      │────▶│ (lookup table)   │        │
│     └────────┬───────────────┘     └──────────────────┘        │
│              │                                                  │
│              │  Enriches with Advertiser + Account REP OPS     │
│              ▼                                                  │
│     ┌────────────────────────┐     ┌──────────────────┐        │
│     │ Normalized_Event_Ledger│────▶│ Unmapped_Networks│        │
│     │ (enriched + normalized)│     │ (missing entries)│        │
│     └────────┬───────────────┘     └──────────────────┘        │
│              │                                                  │
│  B. crossEnrichLedger_()                                        │
│              │  Adds "Also Flagged By" cross-source signals    │
│              ▼                                                  │
│     ┌────────────────────────┐                                 │
│     │ Normalized_Event_Ledger│                                 │
│     │ (with cross-enrichment)│                                 │
│     └────────┬───────────────┘                                 │
│              │                                                  │
│  C. buildSummaries_()                                           │
│              ├──────────────┬──────────────┐                   │
│              ▼              ▼              ▼                    │
│     ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐     │
│     │ Summary_By   │ │ Summary_By   │ │ Summary_By      │     │
│     │ _System      │ │ _Network     │ │ _Issue_Type     │     │
│     └──────────────┘ └──────────────┘ └─────────────────┘     │
│                                                                 │
│  D. buildTrends_()                                              │
│              ├─────────────────────┐                            │
│              ▼                     ▼                            │
│     ┌──────────────┐      ┌──────────────┐                     │
│     │ Trend_Weekly │      │Trend_Monthly │                     │
│     └──────────────┘      └──────────────┘                     │
│                                                                 │
│  E. buildNetworkGrading_()                                      │
│              ▼                                                  │
│     ┌──────────────────────┐                                   │
│     │  Network_Grading     │                                   │
│     │  (A-F grades, single │                                   │
│     │   column, ranked)    │                                   │
│     └──────────────────────┘                                   │
│                                                                 │
│  F. buildRepGrading_()                                          │
│              ▼                                                  │
│     ┌──────────────────────┐                                   │
│     │  Rep_Grading         │                                   │
│     │  (rep performance +  │                                   │
│     │   network breakdown) │                                   │
│     └──────────────────────┘                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Network Mapping Tab - Critical Lookup Table

### **Current Flow (FIXED):**
```
External Spreadsheet (Project 3/EOM)
  Spreadsheet ID: 1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o
  Tab: "Networks"
  
  Structure:
  - Columns A-B: Personal log (ignored)
  - Columns C-O: Config/metadata (ignored)
  - **Columns P-S: Mapping data (extracted)**
    * P: Network ID
    * Q: Network Name
    * R: Advertiser  
    * S: Account REP OPS
           │
           │ refreshNetworkMapping() - Dynamically finds "Network ID" column
           │ Extracts only columns P-S (4 columns from Network ID onwards)
           │ Overwrites Hub's Network_Mapping with fresh data
           ▼
┌──────────────────────────────────────────────────────────────┐
│  AdOps Intelligence Hub - Network_Mapping Tab                │
│                                                              │
│  Columns: Network ID | Network Name | Advertiser | Account  │
│           REP OPS                                            │
│                                                              │
│  ✅ FIXED: refreshNetworkMapping() now finds "Network ID"   │
│      column dynamically and extracts only the 4 mapping     │
│      columns, skipping personal log and metadata            │
└──────────────────────────────────────────────────────────────┘
           │
           │ Used by normalizeEventRow_() to enrich events
           │ Matching logic: Network ID → Network Name → Advertiser (fallback)
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Normalized_Event_Ledger                                     │
│                                                              │
│  Enriched with:                                              │
│  - Advertiser (from mapping)                                 │
│  - Account REP OPS (from mapping)                            │
│                                                              │
│  If mapping incomplete → Rep = '' → shows as "Unassigned"   │
└──────────────────────────────────────────────────────────────┘
```

---

## Issue Resolved

### **Root Cause Identified:**
The Project 3 Networks tab has multiple data sets:
- Columns A-B: Personal network log (user's tracking)
- Columns P-S: Actual mapping data with Advertiser and Rep assignments

Previous code used `getDataRange().getValues()` which copied **ALL columns** including the personal log, causing misaligned headers and empty Advertiser/Rep values in the Hub.

### **Solution Implemented:**
Updated `refreshNetworkMapping()` to:
1. **Dynamically find** the "Network ID" column (column P)
2. **Extract only 4 columns** from that point: Network ID, Network Name, Advertiser, Account REP OPS
3. **Skip all preceding columns** (A-O) containing personal log and metadata

### **Deployment:**
- Committed: `773de61`
- Deployed: 22 files via `clasp push`
- Status: ✅ Ready for testing

---

## Next Steps

1. **Test the fix:**
   - Go to your Hub spreadsheet
   - Run: **AdOps Intelligence Hub Menu → Refresh Network Mapping**
   - Verify Network_Mapping tab now has populated Advertiser and Account REP OPS columns

2. **Run Full Refresh:**
   - After verifying mapping is correct, run: **Full Refresh (All Data)**
   - Check Unmapped_Networks - should now show far fewer items (only truly new networks)
   - Check Rep_Grading - "Unassigned" should have much fewer networks

3. **Expected Results:**
   - Most of those 33 "unmapped" networks should now match correctly
   - Reps should be properly assigned
   - Unmapped_Networks should only show genuinely new advertisers
