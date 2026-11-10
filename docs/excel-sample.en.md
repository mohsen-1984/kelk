# Kelk's Excel sample

This text is the **Excel** view's sample: each Markdown table becomes a sheet, named by the heading or bold line above it. The **XLSX** button makes an Excel workbook, the **CSV** button a zip with one CSV per sheet. To start, clear this text and write or paste your own tables, or import a CSV or XLSX file.

What to look for in the sheets:

- Latin text is left-aligned, Persian text right-aligned in a Persian font, numbers centered; a sheet whose text is mostly Persian opens right to left.
- The code `0012` keeps its leading zeros (text), and a number of more than 15 digits stays text too, since Excel keeps only 15 digits exactly.
- Dates stay as they are written (text), Persian or Gregorian.
- Links stay links in Excel.
- `<br>` in a cell is a line break inside that cell.
- A wide table scrolls sideways inside its own block in the preview; in the file, each column is as wide as its content.

## Products

| SKU | Product | Unit price | Barcode | Account number | Date | Link |
|---|---|---|---|---|---|---|
| 00045 | Notebook A5 | 12.5 | 6260123456789 | 6037991234567890123 | 2025-11-10 | [Kelk](https://mohsen-1984.github.io/kelk/) |
| 00046 | Pen, blue | 1.2 | 6260123456796 | 6037991234567890456 | 2025-11-11 | [GitHub](https://github.com/mohsen-1984/kelk) |
| 01200 | Desk lamp | 34.9 | 6260123456802 | 6037991234567890789 | 2025-11-12 | |

## فروش شعبه‌ها

| شعبه | کد شعبه | تاریخ | فروش (ریال) | یادداشت |
|---|---|---|---|---|
| مشهد مرکزی | 0012 | 1404/08/19 | 1250000000 | Persian and English<br>in one cell |
| تهران، ونک | 0045 | 1404/08/20 | 980000000 | |
| شیراز | 0107 | 1404/08/21 | 715500000 | |

**Monthly report:**

| Region | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| North | 120 | 135 | 128 | 140 | 152 | 149 | 160 | 171 | 158 | 166 | 180 | 195 | 1854 |
| South | 88 | 92 | 95 | 90 | 101 | 99 | 105 | 110 | 108 | 112 | 118 | 125 | 1243 |
| East | 45 | 47 | 52 | 50 | 55 | 58 | 61 | 60 | 63 | 66 | 70 | 74 | 701 |
| West | 30 | 28 | 33 | 35 | 34 | 38 | 40 | 42 | 41 | 45 | 47 | 50 | 463 |
