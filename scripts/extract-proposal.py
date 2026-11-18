"""Extract visible Word paragraphs, tables and equation text without modifying the source."""
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

source, output = map(Path, sys.argv[1:3])
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(source) as doc:
    root = ET.fromstring(doc.read('word/document.xml'))
    lines = []
    for paragraph in root.findall('.//w:body//w:p', ns):
        parts = [node.text or '' for node in paragraph.iter() if node.tag.rsplit('}', 1)[-1] == 't']
        text = ''.join(parts).strip()
        if text:
            lines.append(f'{len(lines)+1:04d} {text}')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text('\n'.join(lines), encoding='utf-8')
print(f'Extracted {len(lines)} paragraphs to {output}')
