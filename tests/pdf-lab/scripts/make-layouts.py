# Web pages with real layouts (sidebar, columns, floated figure) + the Markdown of their main content.
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'corpus')
P = [
 "Cities that plan for heat are rethinking streets, roofs and parks at the same time. A street lined with trees can be several degrees cooler at noon than one of bare asphalt, and the difference grows through the evening.",
 "The first step is usually a map. Satellite images show which blocks absorb the most sunlight, and those maps often match the neighborhoods with the fewest trees and the oldest housing.",
 "Painting roofs white is cheap and fast. It lowers the temperature inside top-floor flats, which matters most for older residents who cannot easily leave a hot building during a heat wave.",
 "Parks do more than shade. Grass and soil release moisture as they warm, and a large park can cool the streets around it for several hundred meters, especially at night.",
 "Water helps too. Fountains, splash pads and restored streams give people a place to cool down, although they need careful design to avoid wasting water in dry seasons.",
 "None of these measures works alone. The cities with the best results combine them, and they measure the effect street by street so the budget goes where it helps most.",
]
def md(title):
    return '# ' + title + '\n\n' + '\n\n'.join(P[:3]) + '\n\n## What works\n\n' + '\n\n'.join(P[3:]) + '\n'
def body_html(title):
    return '<h1>' + title + '</h1>' + ''.join('<p>' + p + '</p>' for p in P[:3]) + '<h2>What works</h2>' + ''.join('<p>' + p + '</p>' for p in P[3:])

base = 'body{font:15px/1.6 "Liberation Sans",Arial,sans-serif;color:#222;margin:0}'
pages = {
 'layout-sidebar': ('Cooling the City', base + """.wrap{display:flex;gap:28px}.side{width:170px;flex:none;background:#f3f3f3;padding:12px;font-size:13px}
   .side ul{list-style:none;padding:0;margin:0}.side li{margin:6px 0}.main{flex:1}header{background:#14365d;color:#fff;padding:10px 16px;font-weight:bold}""",
   lambda t: '<header>Urban Climate Lab</header><div class="wrap"><nav class="side"><b>Topics</b><ul><li>Heat maps</li><li>Green roofs</li><li>Tree cover</li><li>Water features</li><li>Funding</li></ul></nav><main class="main">' + body_html(t) + '</main></div>'),
 'layout-columns': ('Cooling the City', base + 'article{column-count:2;column-gap:28px;text-align:justify}h1{column-span:all}',
   lambda t: '<article>' + body_html(t) + '</article>'),
 'layout-figure': ('Cooling the City', base + 'figure{float:right;width:210px;margin:0 0 10px 16px}figure svg{width:210px;height:140px;display:block}figcaption{font-size:12px;color:#555}',
   lambda t: body_html(t).replace('<p>' + P[1], '<figure><svg viewBox="0 0 210 140"><rect width="210" height="140" fill="#cfe3f5"/><circle cx="160" cy="40" r="22" fill="#f7b733"/><rect x="20" y="70" width="40" height="70" fill="#556"/><rect x="70" y="50" width="50" height="90" fill="#667"/></svg><figcaption>Figure 1. Surface temperature on a July afternoon.</figcaption></figure><p>' + P[1], 1)),
}
for name, (title, css, html) in pages.items():
    open(os.path.join(OUT, name + '.html'), 'w').write('<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title><style>' + css + '</style></head><body>' + html(title) + '</body></html>')
    expected = md(title)
    if name == 'layout-figure': expected = expected.replace(P[1], 'Figure 1. Surface temperature on a July afternoon.\n\n' + P[1], 1)
    open(os.path.join(OUT, name + '.md'), 'w').write(expected)
print('ok')
