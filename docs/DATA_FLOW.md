# AdOps Intelligence Hub - Data Flow Architecture

**Last Updated:** March 30, 2026

---

## 🔄 Full Refresh Workflow (`runFullRefresh()`)

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

## 🔑 Network_Mapping Tab - THE CRITICAL LOOKUP TABLE

### **Current Flow:**
```
External Spreadsheet (Project 3/EOM)
  Spreadsheet ID: 1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o
  Tab: "Networks"
           │
           │ refreshNetworkMapping() - OVERWRITES Hub's Network_Mapping
           ▼
┌──────────────────────────────────────────────────────────────┐
│  AdOps Intelligence Hub - Network_Mapping Tab                │
│                                                              │
│  Columns: Network ID | Network Name | Advertiser | Account  │
│           REP OPS                                            │
│                                                              │
│  ⚠️  PROBLEM: refreshNetworkMapping() copies ALL columns    │
│      from source. If source is missing Advertiser/Rep       │
│      columns, the Hub's mapping gets overwritten with       │
│      empty values!                                           │
└──────────────────────────────────────────────────────────────┘
           │
           │ Used by normalizeEventRow_() to enrich events
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

## ❓ **CRITICAL QUESTIONS:**

### **Question 1: Source Mapping Spreadsheet Structure**
The Project 3/EOM spreadsheet (`1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o`) Networks tab:
- **Does it have 4 columns:** `Network ID | Network Name | Advertiser | Account REP OPS`?
- **Are the Advertiser and Account REP OPS columns populated** with data?
- **Or does it only have 2 columns:** `Network ID | Network Name` (missing the other two)?

### **Question 2: Manual Data Entry**
- Did you **manually add** the Advertiser and Account REP OPS columns to the **Hub's** Network_Mapping tab?
- Are you maintaining that data **only in the Hub**, not in the Project 3 source?

### **Question 3: Refresh Workflow**
- When you run "Refresh Network Mapping" from the menu, do you see the Advertiser and Account REP OPS columns get **wiped out**?
- Or do they stay populated?

---

## 💡 **Suspected Issue:**

I believe what's happening is:

1. **Project 3 source spreadsheet** only has: `Network ID | Network Name` (2 columns)
2. You **manually added** Advertiser and Rep data to the **Hub's** Network_Mapping tab
3. When `refreshNetworkMapping()` runs, it pulls from Project 3 and **overwrites** your manual data
4. This explains why Network_Mapping in export 8 has empty Advertiser/Rep columns

---

## 🔧 **Proposed Solutions (pending your answers):**

### **Option A:** Update Project 3 Source (Recommended)
- Add Advertiser and Account REP OPS columns to Project 3's Networks tab
- Populate them there (single source of truth)
- `refreshNetworkMapping()` will then pull complete data

### **Option B:** Change Hub to Own the Mapping Data
- Stop pulling from Project 3
- Maintain Network_Mapping directly in the Hub
- Disable/remove `refreshNetworkMapping()` calls

### **Option C:** Merge Strategy (Most Robust)
- Pull Network ID + Network Name from Project 3
- Preserve Advertiser and Account REP OPS columns in Hub (don't overwrite)
- Requires code changes to merge instead of replacing

---

**Which option makes sense for your workflow?**
