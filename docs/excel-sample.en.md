# Kelk's Excel sample

This text is the **Excel** view's sample: each Markdown table becomes a sheet, named by the heading or bold line above it. The **XLSX** button makes an Excel workbook, the **CSV** button a zip with one CSV per sheet. To start, clear this text and write or paste your own tables, or import a CSV or XLSX file.

What to look for in the sheets:

- Latin text is left-aligned, numbers centered; Persian and Arabic text is right-aligned in its own font.
- A sheet with even one Persian or Arabic cell opens right to left: here only *Other scripts*, while *Products* and *Monthly report* open left to right.
- The code `00045` keeps its leading zeros (text), and a number of more than 15 digits stays text too, since Excel keeps only 15 digits exactly.
- Dates stay as they are written (text), Gregorian or Persian.
- Links stay links in Excel.
- `<br>` in a cell is a line break inside that cell.
- A wide table scrolls sideways inside its own block in the preview; in the file, each column is as wide as its content.

## Products

| SKU | Product | Unit price | Barcode | Account number | Date | Notes | Link |
|---|---|---|---|---|---|---|---|
| 00045 | Notebook A5 | 12.5 | 6260123456789 | 6037991234567890123 | 2025-11-10 | Lined pages<br>80 sheets | [Kelk](https://mohsen-1984.github.io/kelk/) |
| 00046 | Pen, blue | 1.2 | 6260123456796 | 6037991234567890456 | 2025-11-11 | Box of 12 | [GitHub](https://github.com/mohsen-1984/kelk) |
| 01200 | Desk lamp | 34.9 | 6260123456802 | 6037991234567890789 | 2025-11-12 | | |

## Other scripts

| Language | Greeting | Date | Notes |
|---|---|---|---|
| Persian | سلام | 1404/08/19 | Persian and English<br>in one cell: فارسی |
| Arabic | مرحبا | 1447/05/19 | العربية and English in one cell |
| English | Hello | 2025-11-10 | |

**Monthly report:**

| Region | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| North | 120 | 135 | 128 | 140 | 152 | 149 | 160 | 171 | 158 | 166 | 180 | 195 | 1854 |
| South | 88 | 92 | 95 | 90 | 101 | 99 | 105 | 110 | 108 | 112 | 118 | 125 | 1243 |
| East | 45 | 47 | 52 | 50 | 55 | 58 | 61 | 60 | 63 | 66 | 70 | 74 | 701 |
| West | 30 | 28 | 33 | 35 | 34 | 38 | 40 | 42 | 41 | 45 | 47 | 50 | 463 |
