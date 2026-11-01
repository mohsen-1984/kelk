# Put a three-step process diagram (rounded boxes with text + arrows, DrawingML shapes in a group, like a
# simple SmartArt "Basic Process" once drawn) in place of the [[DIAGRAM]] paragraph of word-rich.docx
import zipfile, shutil, sys, re
src = sys.argv[1]; tmp = src + '.tmp'
EMU = 12700
def box(i, x, text):
    return f'''<wps:wsp><wps:cNvPr id="{10+i}" name="Step {i}"/><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="{x*EMU}" y="0"/><a:ext cx="{110*EMU}" cy="{50*EMU}"/></a:xfrm>
<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr>
<wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="24"/></w:rPr><w:t>{text}</w:t></w:r></w:p></w:txbxContent></wps:txbx>
<wps:bodyPr anchor="ctr" lIns="45720" rIns="45720"/></wps:wsp>'''
def arrow(i, x):
    return f'''<wps:wsp><wps:cNvPr id="{20+i}" name="Arrow {i}"/><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="{x*EMU}" y="{15*EMU}"/><a:ext cx="{30*EMU}" cy="{20*EMU}"/></a:xfrm>
<a:prstGeom prst="rightArrow"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="A5A5A5"/></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp>'''
W, H = 410, 50
group = (f'''<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{W*EMU}" cy="{H*EMU}"/><wp:docPr id="99" name="Process diagram"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:cNvGrpSpPr/>
<wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{W*EMU}" cy="{H*EMU}"/><a:chOff x="0" y="0"/><a:chExt cx="{W*EMU}" cy="{H*EMU}"/></a:xfrm></wpg:grpSpPr>'''
  + box(1, 0, 'Receive') + arrow(1, 115) + box(2, 150, 'Triage') + arrow(2, 265) + box(3, 300, 'Resolve') +
  '</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')
with zipfile.ZipFile(src) as z, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as o:
    for it in z.infolist():
        data = z.read(it.filename)
        if it.filename == 'word/document.xml':
            x = data.decode('utf8')
            for ns, uri in [('wpg', 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'), ('wps', 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'),
                            ('wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'), ('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')]:
                if f'xmlns:{ns}=' not in x: x = x.replace('<w:document ', f'<w:document xmlns:{ns}="{uri}" ', 1)
            x, n = re.subn(r'<w:p>(?:(?!<w:p>).)*?\[\[DIAGRAM\]\].*?</w:p>', group, x, count=1, flags=re.S)
            assert n == 1, 'placeholder'
            data = x.encode('utf8')
        o.writestr(it, data)
shutil.move(tmp, src); print('diagram added')
