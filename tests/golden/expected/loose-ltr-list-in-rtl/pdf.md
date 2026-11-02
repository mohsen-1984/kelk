یک پاراگراف فارسی در سند.

# 1.2 Current shipped solution ("Mode 1" below)

Implemented and working today in `App.converter`:

-   `protectProblematicTables(root)` — runs on the parsed DOM *before* `cleanTableCells`, and flags a table when\
    `table.rows.length === 0`. Each flagged table is replaced **in the DOM**\
    **Why a plain text token:** the sanitized DOM is later serialized to a string unchanged, every time.

```
> ⚠️ This table could not be converted
```

-   `convertBlockByBlock(html, turndownService)` — last-resort safety net. If the single call throws.

This document specifies a **new, opt-in alternative** to the raw-HTML

fallback.
