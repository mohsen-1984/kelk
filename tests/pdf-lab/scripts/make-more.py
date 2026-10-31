# CSV samples, a PowerPoint deck, and Excel border variants (none, black, white) + expected Markdown
import csv, os, random
from openpyxl import Workbook
from openpyxl.styles import Font, Border, Side, PatternFill, Alignment
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
OUT = os.path.join(os.path.dirname(__file__), '..', 'corpus')
random.seed(11)
def md_table(rows):
    return '\n'.join(['| ' + ' | '.join(rows[0]) + ' |', '|' + '|'.join(['---'] * len(rows[0])) + '|'] + ['| ' + ' | '.join(r) + ' |' for r in rows[1:]])

# ── CSV 1: orders (numbers, dates, quoted commas) ──
orders = [['Order', 'Date', 'Customer', 'City', 'Items', 'Total']]
names = ['Acme Corp', 'Blue Harbor Ltd', 'Cedar & Sons', 'Delta Supplies, Inc.', 'Evergreen Co', 'Fjord Trading', 'Granite Works', 'Helios Energy']
cities = ['Lisbon', 'Oslo', 'Toronto', 'Austin', 'Melbourne', 'Nairobi', 'Seoul', 'Lyon']
for i in range(24):
    orders.append([f'SO-{5100+i}', f'2026-0{1+i%9}-{10+i%18:02d}', names[i % 8], cities[(i*3) % 8], str(random.randint(1, 40)), f'{random.uniform(80, 9000):,.2f}'])
with open(os.path.join(OUT, 'orders.csv'), 'w', newline='') as f: csv.writer(f).writerows(orders)
open(os.path.join(OUT, 'orders.md'), 'w').write(md_table(orders) + '\n')

# ── CSV 2: survey (long text cells, empty cells) ──
survey = [['ID', 'Department', 'Score', 'Comment'],
  ['1', 'Finance', '4', 'The new expense form is much faster than the old one'],
  ['2', 'Sales', '2', 'Approval still takes too long when the manager is travelling'],
  ['3', 'Operations', '5', ''],
  ['4', 'HR', '3', 'Good, but the mobile view needs work'],
  ['5', 'Finance', '4', 'Clear instructions; please add a search box'],
  ['6', 'IT', '5', 'No issues reported this quarter'],
  ['7', 'Sales', '1', 'Lost two drafts because the session timed out'],
  ['8', 'Legal', '3', '']]
with open(os.path.join(OUT, 'survey.csv'), 'w', newline='') as f: csv.writer(f).writerows(survey)
open(os.path.join(OUT, 'survey.md'), 'w').write(md_table(survey) + '\n')

# ── Excel: the same table with no borders, black borders, white borders (on a fill) ──
data = [['Product', 'Region', 'Units', 'Price', 'Revenue'], ['Desk lamp', 'North', '120', '24.50', '2,940.00'], ['Office chair', 'South', '45', '189.00', '8,505.00'],
        ['Monitor arm', 'East', '80', '59.90', '4,792.00'], ['Keyboard', 'West', '210', '35.00', '7,350.00'], ['Webcam', 'North', '95', '72.00', '6,840.00']]
for kind in ('none', 'black', 'white'):
    wb = Workbook(); ws = wb.active; ws.title = 'Sales ' + kind
    for r in data:
        ws.append([float(x.replace(',', '')) if i >= 2 and data.index(r) > 0 else x for i, x in enumerate(r)])
    side = {'black': Side(style='thin', color='000000'), 'white': Side(style='medium', color='FFFFFF')}.get(kind)
    for row in ws.iter_rows(min_row=1, max_row=len(data), max_col=5):
        for c in row:
            if side: c.border = Border(left=side, right=side, top=side, bottom=side)
            if kind == 'white': c.fill = PatternFill('solid', fgColor='DDEBF7')
            if c.row == 1: c.font = Font(bold=True)
            if c.column == 3 and c.row > 1: c.number_format = '0'
            if c.column >= 4 and c.row > 1: c.number_format = '#,##0.00'
    for col, w in zip('ABCDE', (16, 10, 8, 10, 12)): ws.column_dimensions[col].width = w
    wb.save(os.path.join(OUT, f'xl-border-{kind}.xlsx'))
    open(os.path.join(OUT, f'xl-border-{kind}.md'), 'w').write(md_table(data) + '\n')

# ── PowerPoint: title, bullets, a table, two columns ──
prs = Presentation(); prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
s = prs.slides.add_slide(prs.slide_layouts[0]); s.shapes.title.text = 'Quarterly Review'; s.placeholders[1].text = 'Operations team - October 2026'
s = prs.slides.add_slide(prs.slide_layouts[1]); s.shapes.title.text = 'Highlights'
tf = s.placeholders[1].text_frame; tf.text = 'Revenue up 7% on the quarter'
for t, lvl in [('Asia-Pacific grew fastest', 1), ('Costs grew more slowly than revenue', 0), ('Two projects need a decision', 0), ('Customer portal budget', 1), ('Supplier onboarding delay', 1)]:
    p = tf.add_paragraph(); p.text = t; p.level = lvl
s = prs.slides.add_slide(prs.slide_layouts[5]); s.shapes.title.text = 'Revenue by region'
rows = [['Region', 'Q2', 'Q3', 'Growth'], ['North America', '4,380', '4,615', '5.4%'], ['Europe', '3,010', '3,155', '4.8%'], ['Asia-Pacific', '2,060', '2,390', '16.0%']]
tb = s.shapes.add_table(len(rows), 4, Inches(1.5), Inches(2), Inches(10), Inches(2.4)).table
for i, r in enumerate(rows):
    for k, v in enumerate(r): tb.cell(i, k).text = v
s = prs.slides.add_slide(prs.slide_layouts[3]); s.shapes.title.text = 'Next steps'
s.placeholders[1].text = 'Approve the revised portal budget'
s.placeholders[2].text = 'Report again in January'
prs.save(os.path.join(OUT, 'deck.pptx'))
open(os.path.join(OUT, 'deck.md'), 'w').write('''# Quarterly Review

Operations team - October 2026

# Highlights

- Revenue up 7% on the quarter
  - Asia-Pacific grew fastest
- Costs grew more slowly than revenue
- Two projects need a decision
  - Customer portal budget
  - Supplier onboarding delay

# Revenue by region

''' + md_table(rows) + '''

# Next steps

Approve the revised portal budget

Report again in January
''')
print('ok')
