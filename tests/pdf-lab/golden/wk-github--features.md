# Field Guide to Release Notes

Release notes are read by people in a hurry. This guide collects the patterns that make them easier to scan, with an example of each.

## Structure

### Lists inside lists

1. Summarize the release in one sentence.
2. Group the changes by audience:
   - Users
     - New features
     - Changed behavior
   - Administrators
     1. Configuration keys
     2. Migration steps
3. Link to the full changelog.

### Continuing a numbered list

5. Mark breaking changes clearly.
6. Give the date and the version number.
7. Thank the contributors by name.

### Emphasis that carries meaning

Use **bold** for the name of a setting, *italics* for a term defined in the text, and ***both*** only for warnings. A removed option can be shown as ~~legacy_mode~~ with a note on its replacement. Keep `inline code` for values a reader can copy.

## Quoting users

> The new export button saved our team an hour every week.
>
> > We still miss the old shortcut, though.
>
> — Customer feedback, March

## Long references

Readers often need the exact address of a document, such as https://docs.example.com/releases/2026/october/notes-for-administrators-and-integrators.html, so print it in full even when it wraps.

## A wide table

| Version | Date | Kind | Highlights | Breaking |
|---------|------|------|------------|----------|
| 4.2.0 | 2026-10-01 | Minor | Export to Parquet, faster search | No |
| 4.1.3 | 2026-09-12 | Patch | Fix for time zones in reports | No |
| 4.0.0 | 2026-08-01 | Major | New permission model, API v3 | Yes |

## Checklist before publishing

- [x] Spell-check the text
- [x] Verify every link
- [ ] Ask support to review the wording
- [ ] Schedule the announcement

#### Small print

Notes for previous versions stay online for two years.
