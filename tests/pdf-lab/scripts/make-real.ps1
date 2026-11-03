# The real-producer corpus (plan P4.1): our own CC0 documents made by Microsoft Word, Excel and PowerPoint
# themselves (COM), then turned into PDFs by those programs, as people do it on Windows:
#   word2024-save--<doc>.pdf   Word "Save as PDF" (Document.ExportAsFixedFormat, structure tags on: the dialog's default)
#   msprint-word--<doc>.pdf   Word printing to "Microsoft Print to PDF" (PrintOut with PrintToFile and a file name)
#   excel2024--<doc>.pdf       Excel "Save as PDF" (Workbook.ExportAsFixedFormat)
#   msprint-excel--<doc>.pdf  Excel printing to "Microsoft Print to PDF"
#   ppt2024--<doc>.pdf         PowerPoint "Save as PDF" (Presentation.SaveAs, ppSaveAsPDF = 32)
#   msprint-ppt--<doc>.pdf    PowerPoint printing to "Microsoft Print to PDF"
# The text of each document is its reference, corpus/real-<doc>.md (written by hand: the source text); this script
# types that text into a new Word / Excel / PowerPoint file (corpus/real-src/real-<doc>.docx|xlsx|pptx) with the
# program's own styles (Heading 1, List Bullet, a bordered table, a sheet's cells, a deck's title and text
# layouts), right to left where the document is. The lab's older Office files (corpus/word-*.docx,
# corpus/xl-border-*.xlsx) go through the same exports (TODO "Producers still to test").
# Needs Windows with Microsoft Office LTSC 2024 (Word, Excel, PowerPoint; an older Office draws other default fonts), the
# "Microsoft Print to PDF" printer, the fonts B Nazanin and Traditional Arabic, and Node (strip-meta.js at the end):
# corpus/real-src/README.md, «What remaking needs».
# The browsers' PDFs of the same text: make-real.js.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests/pdf-lab/scripts/make-real.ps1 [-Only name-regex] [-Rebuild]
# Each document runs in its own PowerShell process with a time limit (an open Office dialog would block the
# machine): on a timeout the process and the Office instance it started are killed. Every application is
# invisible, with its alerts off, and quits in a finally block. The system's default printer is restored at
# the end (Word's ActivePrinter changes it).
param([string]$Only = '', [switch]$Rebuild, [string]$Worker = '', [int]$Timeout = 180)
$ErrorActionPreference = 'Stop'
$LAB = Split-Path -Parent $PSScriptRoot
$CORPUS = Join-Path $LAB 'corpus'
$SRC = Join-Path $CORPUS 'real-src'
$PDF = Join-Path $LAB 'pdf\real-producers'
$M = [Type]::Missing
$MSPRINT = 'Microsoft Print to PDF'

# name, kind, source (made from corpus/<name>.md, or an existing corpus file), right to left, font, size
$DOCS = @(
  @{ n = 'real-memo-fa';          k = 'word';  rtl = $true;  font = 'B Nazanin';          size = 13 },
  @{ n = 'real-report-fa';        k = 'word';  rtl = $true;  font = $null;                size = 11; pageNumbers = $true },
  @{ n = 'real-letter-ar';        k = 'word';  rtl = $true;  font = 'Traditional Arabic'; size = 15 },
  @{ n = 'real-readme-en';        k = 'word';  rtl = $false; font = $null;                size = 11 },
  @{ n = 'real-sheet-borders-fa'; k = 'excel'; rtl = $true;  font = 'B Nazanin';          size = 12; borders = $true },
  @{ n = 'real-sheet-plain-fa';   k = 'excel'; rtl = $true;  font = $null;                size = 11; borders = $false },
  @{ n = 'real-deck-fa';          k = 'ppt';   rtl = $true },
  @{ n = 'real-deck-en';          k = 'ppt';   rtl = $false },
  @{ n = 'word-tables';           k = 'word';  existing = 'word-tables.docx' },
  @{ n = 'word-rich';             k = 'word';  existing = 'word-rich.docx' },
  @{ n = 'xl-border-none';        k = 'excel'; existing = 'xl-border-none.xlsx' },
  @{ n = 'xl-border-black';       k = 'excel'; existing = 'xl-border-black.xlsx' },
  @{ n = 'xl-border-white';       k = 'excel'; existing = 'xl-border-white.xlsx' }
)

# ---- the Markdown subset the references use: headings, paragraphs, - and 1. lists, tables, **bold** ----
function Read-Blocks([string]$file) {
  $text = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) -replace "`r", ''
  $blocks = @()
  foreach ($chunk in ($text.Trim() -split "`n\s*`n")) {
    $lines = @($chunk -split "`n" | Where-Object { $_.Trim() -ne '' })
    if ($lines[0] -match '^\|') {
      $rows = @($lines | Where-Object { $_ -notmatch '^\|[\s|:-]+\|$' } | ForEach-Object { , @(($_.Trim().Trim('|') -split '\|') | ForEach-Object { $_.Trim() }) })
      $blocks += @{ t = 'table'; rows = $rows }
    } elseif ($lines[0] -match '^- ') { $blocks += @{ t = 'bullets'; items = @($lines | ForEach-Object { $_ -replace '^- ', '' }) } }
    elseif ($lines[0] -match '^\d+\. ') { $blocks += @{ t = 'numbers'; items = @($lines | ForEach-Object { $_ -replace '^\d+\. ', '' }) } }
    elseif ($lines[0] -match '^(#+) (.*)$') { $blocks += @{ t = 'heading'; level = $Matches[1].Length; text = $Matches[2] } }
    else { $blocks += @{ t = 'para'; text = ($lines -join ' ') } }
  }
  return $blocks
}
# '**a** b' -> @(@('a', $true), @(' b', $false))
function Split-Bold([string]$s) {
  $parts = $s -split '\*\*'; $out = @()
  for ($i = 0; $i -lt $parts.Length; $i++) { if ($parts[$i] -ne '') { $out += , @($parts[$i], ($i % 2 -eq 1)) } }
  return , $out                                        # (the comma: a single pair is not unrolled)
}
function Plain([string]$s) { return $s -replace '\*\*', '' }

# ---- Word ----
function Build-Word($word, $d, $out) {
  $doc = $word.Documents.Add()
  $normal = $doc.Styles.Item(-1)                       # wdStyleNormal
  if ($d.rtl) {
    $normal.ParagraphFormat.ReadingOrder = 0           # wdReadingOrderRtl
    $normal.ParagraphFormat.Alignment = 2              # flush right
    $normal.Font.SizeBi = $d.size
    if ($d.font) { $normal.Font.NameBi = $d.font }
    foreach ($sid in -2, -3, -4) { $h = $doc.Styles.Item($sid); $h.ParagraphFormat.ReadingOrder = 0; $h.ParagraphFormat.Alignment = 2; if ($d.font) { $h.Font.NameBi = $d.font } }
  }
  $sel = $word.Selection
  foreach ($b in (Read-Blocks (Join-Path $CORPUS ($d.n + '.md')))) {
    switch ($b.t) {
      'heading' { $sel.Style = $doc.Styles.Item(-1 - $b.level); $sel.TypeText((Plain $b.text)); $sel.TypeParagraph() }
      'para' {
        $sel.Style = $normal
        foreach ($p in (Split-Bold $b.text)) { $sel.Font.Bold = [int]$p[1]; $sel.Font.BoldBi = [int]$p[1]; $sel.TypeText($p[0]) }
        $sel.Font.Bold = 0; $sel.Font.BoldBi = 0; $sel.TypeParagraph()
      }
      { $_ -in 'bullets', 'numbers' } {
        $sel.Style = $doc.Styles.Item($(if ($b.t -eq 'bullets') { -49 } else { -50 }))   # List Bullet / List Number
        if ($d.rtl) { $sel.ParagraphFormat.ReadingOrder = 0 }
        foreach ($it in $b.items) { $sel.TypeText((Plain $it)); $sel.TypeParagraph() }
        $sel.Style = $normal
      }
      'table' {
        $nr = $b.rows.Count; $nc = $b.rows[0].Count
        $t = $doc.Tables.Add($sel.Range, $nr, $nc)
        $t.Borders.Enable = 1
        if ($d.rtl) { $t.TableDirection = 0 }          # wdTableDirectionRtl
        for ($r = 1; $r -le $nr; $r++) { for ($c = 1; $c -le $nc; $c++) {
          $cell = $t.Cell($r, $c).Range; $cell.Text = (Plain $b.rows[$r - 1][$c - 1])
          if ($r -eq 1) { $cell.Font.Bold = 1; $cell.Font.BoldBi = 1 }
        } }
        $t.Rows.Item(1).HeadingFormat = -1
        $t.AutoFitBehavior(1)                          # wdAutoFitContent
        $t.AutoFitBehavior(2)                          # then the window: as wide as the text column
        $sel.EndKey(6) | Out-Null                      # wdStory: the paragraph Word keeps after a table
      }
    }
  }
  if ($d.pageNumbers) { $doc.Sections.Item(1).Footers.Item(1).PageNumbers.Add(1, $true) | Out-Null }
  $doc.SaveAs2([string]$out, 16)                              # wdFormatXMLDocument
  return $doc
}
function Export-Word($word, $doc, $d) {
  $save = [string](Join-Path $PDF ('word2024-save--' + $d.n + '.pdf'))
  # ExportAsFixedFormat(file, wdExportFormatPDF, open, optimize print, all, from, to, content, doc props, IRM, no bookmarks, structure tags, bitmap missing fonts, ISO 19005-1)
  $doc.ExportAsFixedFormat($save, 17, $false, 0, 0, 1, 1, 0, $true, $true, 0, $true, $true, $false)
  $print = [string](Join-Path $PDF ('msprint-word--' + $d.n + '.pdf'))
  $word.ActivePrinter = $MSPRINT
  # PrintOut(background, append, range all, output file, from, to, item, copies, pages, page type, print to file, collate)
  $doc.PrintOut($false, $false, 0, $print, $M, $M, 0, 1, $M, 0, $true, $true)
}

# ---- Excel ----
function Build-Excel($xl, $d, $out) {
  $wb = $xl.Workbooks.Add(); $ws = $wb.Worksheets.Item(1)
  $blocks = Read-Blocks (Join-Path $CORPUS ($d.n + '.md'))
  $title = ($blocks | Where-Object { $_.t -eq 'heading' } | Select-Object -First 1).text
  $rows = ($blocks | Where-Object { $_.t -eq 'table' } | Select-Object -First 1).rows
  $nc = $rows[0].Count
  if ($d.rtl) { $ws.DisplayRightToLeft = $true }
  $ws.Cells.Font.Size = $d.size; if ($d.font) { $ws.Cells.Font.Name = $d.font }
  $ws.Name = 'Sheet1'
  $ws.Cells.Item(1, 1).Value2 = $title
  $ws.Cells.Item(1, 1).Font.Bold = $true; $ws.Cells.Item(1, 1).Font.Size = $d.size + 4
  $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item(1, $nc)).Merge()
  $ws.Cells.Item(1, 1).HorizontalAlignment = -4108                 # xlCenter
  for ($r = 0; $r -lt $rows.Count; $r++) { for ($c = 0; $c -lt $nc; $c++) {
    $cell = $ws.Cells.Item($r + 3, $c + 1); $v = $rows[$r][$c]
    # (ASCII digits only: .NET's \d takes Persian ones too, and a Persian row number stays text)
    if ($r -gt 0 -and $v -match '^[0-9]{1,3}(,[0-9]{3})+$') { $cell.NumberFormat = '#,##0'; $cell.Value2 = [double]($v -replace ',', '') }
    elseif ($r -gt 0 -and $v -match '^[0-9]+$') { $cell.Value2 = [double]$v }
    else { $cell.NumberFormat = '@'; $cell.Value2 = $v }
  } }
  $head = $ws.Range($ws.Cells.Item(3, 1), $ws.Cells.Item(3, $nc)); $head.Font.Bold = $true
  $all = $ws.Range($ws.Cells.Item(3, 1), $ws.Cells.Item($rows.Count + 2, $nc))
  if ($d.borders) {
    foreach ($e in 7, 8, 9, 10, 11, 12) { $all.Borders.Item($e).LineStyle = 1; $all.Borders.Item($e).Weight = 2 }   # edges and inside lines, thin
    $head.Interior.Color = 0xEBDDD9                                                                                 # a light fill (BGR)
  }
  $ws.Columns.AutoFit() | Out-Null
  $ws.PageSetup.Orientation = 2                                    # landscape: six columns
  $ws.PageSetup.Zoom = $false; $ws.PageSetup.FitToPagesWide = 1; $ws.PageSetup.FitToPagesTall = $false
  $wb.SaveAs([string]$out, 51)                                             # xlOpenXMLWorkbook
  return $wb
}
function Export-Excel($xl, $wb, $d) {
  $wb.ExportAsFixedFormat(0, ([string](Join-Path $PDF ('excel2024--' + $d.n + '.pdf'))), 0, $true, $false)   # xlTypePDF, standard quality, doc props
  $port = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Devices').$MSPRINT -replace '^winspool,', ''
  # PrintOut(from, to, copies, preview, active printer, print to file, collate, file name)
  $wb.PrintOut($M, $M, 1, $false, ($MSPRINT + ' on ' + $port), $true, $true, ([string](Join-Path $PDF ('msprint-excel--' + $d.n + '.pdf'))))
}

# ---- PowerPoint ----
function Set-Dir($tr, $rtl) { if ($rtl) { $tr.ParagraphFormat.TextDirection = 2; $tr.ParagraphFormat.Alignment = 3 } }   # ppDirectionRightToLeft, ppAlignRight
function Build-Ppt($pp, $d, $out) {
  $pres = $pp.Presentations.Add(0)                                 # no window
  $blocks = Read-Blocks (Join-Path $CORPUS ($d.n + '.md'))
  $slides = @(); foreach ($b in $blocks) { if ($b.t -eq 'heading') { $slides += , @{ title = $b.text; body = @() } } else { $slides[-1].body += $b } }
  $i = 0
  foreach ($s in $slides) {
    $i++
    $table = $s.body | Where-Object { $_.t -eq 'table' } | Select-Object -First 1
    $layout = if ($i -eq 1) { 1 } elseif ($table) { 11 } else { 2 }        # ppLayoutTitle, ppLayoutTitleOnly, ppLayoutText
    $sl = $pres.Slides.Add($i, $layout)
    $tt = $sl.Shapes.Item(1).TextFrame.TextRange; $tt.Text = $s.title; Set-Dir $tt $d.rtl
    if ($table) {
      $rows = $table.rows
      $shape = $sl.Shapes.AddTable($rows.Count, $rows[0].Count, 60, 150, 840, 40 * $rows.Count)
      if ($d.rtl) { $shape.Table.TableDirection = 2 }
      for ($r = 1; $r -le $rows.Count; $r++) { for ($c = 1; $c -le $rows[0].Count; $c++) {
        $ct = $shape.Table.Cell($r, $c).Shape.TextFrame.TextRange; $ct.Text = $rows[$r - 1][$c - 1]; $ct.Font.Size = 20; Set-Dir $ct $d.rtl
      } }
    } elseif ($s.body.Count) {
      $lines = @(); $bullets = $false
      foreach ($b in $s.body) { if ($b.t -eq 'bullets') { $lines += $b.items; $bullets = $true } else { $lines += (Plain $b.text) } }
      $bt = $sl.Shapes.Item(2).TextFrame.TextRange; $bt.Text = ($lines -join "`r"); Set-Dir $bt $d.rtl
      if (-not $bullets) { $bt.ParagraphFormat.Bullet.Visible = 0 }
    }
  }
  $pres.SaveAs([string]$out, 24)                                           # ppSaveAsOpenXMLPresentation
  return $pres
}
function Export-Ppt($pp, $pres, $d) {
  $pres.SaveAs(([string](Join-Path $PDF ('ppt2024--' + $d.n + '.pdf'))), 32)  # ppSaveAsPDF
  $pres.PrintOptions.ActivePrinter = $MSPRINT
  $pres.PrintOptions.PrintInBackground = 0
  $pres.PrintOut(1, $pres.Slides.Count, ([string](Join-Path $PDF ('msprint-ppt--' + $d.n + '.pdf'))))
}

# ---- one document in this process (-Worker) ----
if ($Worker) {
  $d = $DOCS | Where-Object { $_.n -eq $Worker }
  $ext = @{ word = '.docx'; excel = '.xlsx'; ppt = '.pptx' }[$d.k]
  $src = if ($d.existing) { Join-Path $CORPUS $d.existing } else { Join-Path $SRC ($d.n + $ext) }
  $app = $null; $file = $null
  try {
    if ($d.k -eq 'word') {
      $app = New-Object -ComObject Word.Application; $app.Visible = $false; $app.DisplayAlerts = 0
      $printer = $app.ActivePrinter
      # digits as Word draws them by default with right-to-left support (Options > Advanced > Numeral: Context):
      # this machine's own setting (Hindi) draws every digit, English documents' too, Arabic-Indic; put back after
      $numeral = $app.Options.ArabicNumeral; $app.Options.ArabicNumeral = 2
      try {
        $file = if ($d.existing -or ((Test-Path $src) -and -not $Rebuild)) { $app.Documents.Open([string]$src, $false, $true) } else { Build-Word $app $d $src }
        Export-Word $app $file $d
      } finally { try { $app.ActivePrinter = $printer } catch { }; $app.Options.ArabicNumeral = $numeral }
      $file.Close(0)
    } elseif ($d.k -eq 'excel') {
      $app = New-Object -ComObject Excel.Application; $app.Visible = $false; $app.DisplayAlerts = $false
      # every sheet as an English Windows shows it, whatever this machine's locale: a Persian locale writes 24.50 as
      # 24/50 and 1,250 with its own separators; Excel keeps these options, so they are put back after the export
      $sep = @($app.UseSystemSeparators, $app.DecimalSeparator, $app.ThousandsSeparator)
      $app.UseSystemSeparators = $false; $app.DecimalSeparator = '.'; $app.ThousandsSeparator = ','
      try {
        $file = if ($d.existing -or ((Test-Path $src) -and -not $Rebuild)) { $app.Workbooks.Open([string]$src, 0, $true) } else { Build-Excel $app $d $src }
        Export-Excel $app $file $d
        $file.Close($false)
      } finally { $app.DecimalSeparator = $sep[1]; $app.ThousandsSeparator = $sep[2]; $app.UseSystemSeparators = $sep[0] }
    } else {
      $app = New-Object -ComObject PowerPoint.Application; $app.DisplayAlerts = 1          # ppAlertsNone (a PowerPoint window stays hidden: no window opened)
      $file = if ((Test-Path $src) -and -not $Rebuild) { $app.Presentations.Open([string]$src, -1, 0, 0) } else { Build-Ppt $app $d $src }
      Export-Ppt $app $file $d
      $file.Close()
    }
    Write-Output ('ok ' + $d.n)
  } finally {
    if ($app) { try { $app.Quit() } catch { }; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
  }
  exit 0
}

# ---- the driver: one process per document, with a time limit ----
New-Item -ItemType Directory -Force $SRC, $PDF | Out-Null
$defaultPrinter = (Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name
$procName = @{ word = 'WINWORD'; excel = 'EXCEL'; ppt = 'POWERPNT' }
$failed = 0
try {
  foreach ($d in ($DOCS | Where-Object { $_.n -match $Only })) {
    $before = @(Get-Process $procName[$d.k] -ErrorAction SilentlyContinue | ForEach-Object Id)
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Worker', $d.n) + $(if ($Rebuild) { @('-Rebuild') } else { @() })
    $p = Start-Process powershell -ArgumentList $argv -NoNewWindow -PassThru; $null = $p.Handle
    if (-not $p.WaitForExit($Timeout * 1000)) {
      $failed++; Write-Output ('TIMEOUT ' + $d.n + ' after ' + $Timeout + ' s: killed')
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    } elseif ($p.ExitCode -ne 0) { $failed++; Write-Output ('FAILED ' + $d.n + ' (exit ' + $p.ExitCode + ')') }
    # an Office instance this run started and did not close (a timeout, a crash) is killed; the user's own are kept
    Get-Process $procName[$d.k] -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object { Start-Sleep -Milliseconds 1500; if (-not $_.HasExited) { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } }
  }
} finally {
  # (when Windows manages the default printer it makes the last one used the default, a few seconds after the job:
  # set it back, wait, and set it back again until it holds)
  for ($i = 0; $defaultPrinter -and $i -lt 6; $i++) {
    if ((Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name -eq $defaultPrinter -and $i -ge 2) { break }
    $null = Invoke-CimMethod -InputObject (Get-CimInstance Win32_Printer -Filter ("Name='" + ($defaultPrinter -replace '\\', '\\') + "'")) -MethodName SetDefaultPrinter
    Start-Sleep -Seconds 3
  }
  if ($defaultPrinter -and (Get-CimInstance Win32_Printer -Filter 'Default=TRUE').Name -ne $defaultPrinter) { Write-Output ('NOTE: the default printer is no longer ' + $defaultPrinter + ': set it back by hand') }
}
# no user name and no local folder in the committed files: Office writes the user as the author (the sources' core.xml,
# the Save as PDF files' /Author and XMP) and a workbook's folder (x15ac:absPath); strip-meta.js clears them
& node (Join-Path $PSScriptRoot 'strip-meta.js') $SRC $PDF
if ($LASTEXITCODE) { $failed++; Write-Output 'FAILED strip-meta.js: personal metadata may be left in the files' }
Get-ChildItem $PDF -Filter *.pdf | Sort-Object Name | ForEach-Object { '{0,8}  {1}' -f $_.Length, $_.Name }
if ($failed) { exit 1 }
