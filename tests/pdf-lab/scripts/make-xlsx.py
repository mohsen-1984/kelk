# Workbooks like the ones people turn into PDFs, plus the Markdown each should come back as.
# python3 scripts/make-xlsx.py  → corpus/xl-*.xlsx + corpus/xl-*.md
import datetime, random, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.worksheet.page import PageMargins

OUT = os.path.join(os.path.dirname(__file__), '..', 'corpus')
thin = Side(style='thin', color='000000')
grid = Border(left=thin, right=thin, top=thin, bottom=thin)
random.seed(7)

def md_table(header, rows):
    out = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join(['---'] * len(header)) + '|']
    for r in rows: out.append('| ' + ' | '.join(r) + ' |')
    return '\n'.join(out)

def fmt_int(v): return f'{v:,}'
def fmt_money(v): return f'${v:,.2f}'

# 1. sales: merged title, styled header with fill, borders, number formats, total row
def sales():
    wb = Workbook(); ws = wb.active; ws.title = 'Sales'
    ws['A1'] = 'Regional Sales Summary 2026'; ws['A1'].font = Font(size=16, bold=True)
    ws.merge_cells('A1:F1')
    hdr = ['Region', 'Manager', 'Units', 'Revenue', 'Margin', 'Closed']
    ws.append([]); ws.append(hdr)
    for c in ws[3]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='305496'); c.border = grid
        c.alignment = Alignment(horizontal='center')
    data = [('North', 'Alice Grant', 1240, 48210.5, 0.231, datetime.date(2026, 3, 14)),
            ('South', 'Bruno Diaz', 860, 31877.25, 0.198, datetime.date(2026, 4, 2)),
            ('East', 'Chen Wei', 1515, 60110.0, 0.254, datetime.date(2026, 2, 27)),
            ('West', 'Dana Kowalski', 990, 40250.75, 0.212, datetime.date(2026, 5, 9)),
            ('Central', 'Emeka Obi', 705, 26880.4, 0.187, datetime.date(2026, 1, 30))]
    rows = []
    for d in data:
        ws.append(list(d)); r = ws.max_row
        ws.cell(r, 3).number_format = '#,##0'; ws.cell(r, 4).number_format = '"$"#,##0.00'
        ws.cell(r, 5).number_format = '0.0%'; ws.cell(r, 6).number_format = 'yyyy-mm-dd'
        for c in ws[r]: c.border = grid
        rows.append([d[0], d[1], fmt_int(d[2]), fmt_money(d[3]), f'{d[4]*100:.1f}%', d[5].isoformat()])
    tu = sum(d[2] for d in data); tr = sum(d[3] for d in data)
    ws.append(['Total', '', tu, tr]); r = ws.max_row
    ws.cell(r, 3).number_format = '#,##0'; ws.cell(r, 4).number_format = '"$"#,##0.00'
    for c in ws[r]: c.border = grid; c.font = Font(bold=True)
    rows.append(['Total', '', fmt_int(tu), fmt_money(tr), '', ''])
    for col, w in zip('ABCDEF', (12, 18, 9, 14, 9, 12)): ws.column_dimensions[col].width = w
    wb.save(os.path.join(OUT, 'xl-sales.xlsx'))
    open(os.path.join(OUT, 'xl-sales.md'), 'w').write('# Regional Sales Summary 2026\n\n' + md_table(hdr, rows) + '\n')

# 2. plain: no borders, no fills (gridlines are not printed by default)
def plain():
    wb = Workbook(); ws = wb.active; ws.title = 'Inventory'
    hdr = ['SKU', 'Item', 'Warehouse', 'On hand', 'Reorder at', 'Unit cost']
    ws.append(hdr)
    for c in ws[1]: c.font = Font(bold=True)
    items = ['Hex bolt M8', 'Washer 10 mm', 'Cable tie 200', 'Fuse 5 A', 'Relay 12 V', 'Gasket kit', 'Bearing 6204', 'Hose clamp', 'Spring pin', 'Wing nut M6', 'Lock washer', 'Grease 400 g']
    rows = []
    for i, it in enumerate(items):
        sku = f'SK-{1001 + i}'; wh = random.choice(['Leeds', 'Porto', 'Lyon', 'Graz'])
        oh = random.randint(5, 4000); ra = random.randint(50, 600); uc = round(random.uniform(0.05, 40), 2)
        ws.append([sku, it, wh, oh, ra, uc]); r = ws.max_row
        ws.cell(r, 4).number_format = '#,##0'; ws.cell(r, 6).number_format = '0.00'
        rows.append([sku, it, wh, fmt_int(oh), str(ra), f'{uc:.2f}'])
    for col, w in zip('ABCDEF', (10, 16, 12, 10, 11, 10)): ws.column_dimensions[col].width = w
    wb.save(os.path.join(OUT, 'xl-plain.xlsx'))
    open(os.path.join(OUT, 'xl-plain.md'), 'w').write(md_table(hdr, rows) + '\n')

# 3. long: 150 rows, print titles (row 1 repeated), header / footer with page numbers, gridlines printed
def long():
    wb = Workbook(); ws = wb.active; ws.title = 'Ledger'
    hdr = ['Date', 'Ref', 'Account', 'Description', 'Debit', 'Credit']
    ws.append(hdr)
    for c in ws[1]: c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='D9E1F2')
    accts = ['Cash', 'Receivables', 'Payables', 'Revenue', 'Rent', 'Payroll', 'Travel', 'Supplies']
    descs = ['Monthly rent', 'Client invoice', 'Office supplies', 'Staff travel', 'Salary run', 'Supplier payment', 'Refund', 'Bank fee']
    rows = []
    d0 = datetime.date(2026, 1, 1)
    for i in range(150):
        d = d0 + datetime.timedelta(days=i * 2); ref = f'J{2400 + i}'
        a = accts[i % len(accts)]; ds = descs[(i * 3) % len(descs)]
        amt = round(random.uniform(10, 9000), 2); dr = amt if i % 2 == 0 else None; cr = None if i % 2 == 0 else amt
        ws.append([d, ref, a, ds, dr, cr]); r = ws.max_row
        ws.cell(r, 1).number_format = 'dd/mm/yyyy'; ws.cell(r, 5).number_format = '#,##0.00'; ws.cell(r, 6).number_format = '#,##0.00'
        rows.append([d.strftime('%d/%m/%Y'), ref, a, ds, f'{dr:,.2f}' if dr else '', f'{cr:,.2f}' if cr else ''])
    ws.print_title_rows = '1:1'
    ws.print_options.gridLines = True
    ws.oddHeader.center.text = '&A'
    ws.oddFooter.center.text = 'Page &P of &N'
    for col, w in zip('ABCDEF', (11, 8, 13, 18, 11, 11)): ws.column_dimensions[col].width = w
    wb.save(os.path.join(OUT, 'xl-long.xlsx'))
    open(os.path.join(OUT, 'xl-long.md'), 'w').write(md_table(hdr, rows) + '\n')

# 4. wide: 16 month columns → pages side by side (printed down, then over)
def wide():
    wb = Workbook(); ws = wb.active; ws.title = 'Budget'
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    hdr = ['Cost center', 'Owner'] + months + ['Total', 'Note']
    ws.append(hdr)
    for c in ws[1]: c.font = Font(bold=True); c.border = grid
    centers = [('Marketing', 'K. Ito'), ('Sales', 'L. Moreno'), ('IT', 'P. Shah'), ('HR', 'R. Klein'), ('Finance', 'S. Haddad'), ('Legal', 'T. Berg'), ('Facilities', 'U. Novak'), ('R&D', 'V. Rao')]
    rows = []
    for cc, ow in centers:
        vals = [random.randint(800, 9800) for _ in months]
        ws.append([cc, ow] + vals + [sum(vals), 'approved' if random.random() > 0.3 else 'draft']); r = ws.max_row
        for k in range(3, 16): ws.cell(r, k).number_format = '#,##0'
        for c in ws[r]: c.border = grid
        rows.append([cc, ow] + [fmt_int(v) for v in vals] + [fmt_int(sum(vals)), ws.cell(r, 16).value])
    for k in range(1, 17): ws.column_dimensions[ws.cell(1, k).column_letter].width = 12 if k <= 2 else 8
    wb.save(os.path.join(OUT, 'xl-wide.xlsx'))
    open(os.path.join(OUT, 'xl-wide.md'), 'w').write(md_table(hdr, rows) + '\n')

# 5. multi: two sheets, the second with wrapped text in cells
def multi():
    wb = Workbook(); ws = wb.active; ws.title = 'Staff'
    hdr1 = ['Name', 'Team', 'Start', 'Level']
    ws.append(hdr1)
    for c in ws[1]: c.font = Font(bold=True); c.border = grid
    people = [('Ana Lima', 'Design', '2021-04-01', 'Senior'), ('Ben Ode', 'Data', '2023-09-15', 'Junior'), ('Cara Holt', 'Ops', '2019-01-07', 'Lead'), ('Dev Patel', 'Data', '2022-06-20', 'Mid')]
    for p in people:
        ws.append(list(p))
        for c in ws[ws.max_row]: c.border = grid
    for col, w in zip('ABCD', (14, 10, 12, 10)): ws.column_dimensions[col].width = w
    ws2 = wb.create_sheet('Issues')
    hdr2 = ['ID', 'Summary', 'Owner', 'State']
    ws2.append(hdr2)
    for c in ws2[1]: c.font = Font(bold=True); c.border = grid
    issues = [('101', 'Login fails after the password is reset from the mobile app', 'Ana Lima', 'Open'),
              ('102', 'Export to CSV drops the last column when a filter is active', 'Dev Patel', 'Fixed'),
              ('103', 'Typo on the invoice page', 'Ben Ode', 'Closed')]
    for it in issues:
        ws2.append(list(it))
        for c in ws2[ws2.max_row]: c.border = grid; c.alignment = Alignment(wrap_text=True, vertical='top')
    for col, w in zip('ABCD', (6, 30, 12, 8)): ws2.column_dimensions[col].width = w
    wb.save(os.path.join(OUT, 'xl-multi.xlsx'))
    open(os.path.join(OUT, 'xl-multi.md'), 'w').write(md_table(hdr1, [list(p) for p in people]) + '\n\n' + md_table(hdr2, [list(i) for i in issues]) + '\n')

sales(); plain(); long(); wide(); multi()
print('ok')
