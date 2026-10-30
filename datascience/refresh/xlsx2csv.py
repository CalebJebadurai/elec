"""XLSX/XLS -> CSV converter (first sheet). XLSX uses only the standard library; legacy
XLS files (ECI ships some with an .xlsx name) need xlrd, e.g. PYTHONPATH=xlrd-2.0.1-py2.py3-none-any.whl.
Usage: python3 xlsx2csv.py <in> <out.csv>"""
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def col_index(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xls_rows(path: str):
    import xlrd  # noqa: PLC0415  (only needed for legacy files)

    sheet = xlrd.open_workbook(path, on_demand=True, ignore_workbook_corruption=True).sheet_by_index(0)
    for i in range(sheet.nrows):
        row = []
        for c in sheet.row(i):
            v = c.value
            row.append(str(int(v)) if isinstance(v, float) and v.is_integer() else str(v).strip())
        yield row


def read_rows(path: str):
    with open(path, "rb") as f:
        if f.read(4) != b"PK\x03\x04":
            yield from read_xls_rows(path)
            return
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    sheets = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    root = ET.fromstring(z.read(sheets[0]))
    for row in root.iter(f"{{{NS['m']}}}row"):
        vals: dict[int, str] = {}
        for c in row.findall("m:c", NS):
            t = c.get("t")
            v = c.find("m:v", NS)
            if t == "inlineStr":
                text = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
            elif v is None:
                text = ""
            elif t == "s":
                text = shared[int(v.text)]
            else:
                text = v.text or ""
            vals[col_index(c.get("r"))] = text.strip()
        if vals:
            yield [vals.get(i, "") for i in range(max(vals) + 1)]


if __name__ == "__main__":
    with open(sys.argv[2], "w", newline="") as f:
        csv.writer(f).writerows(read_rows(sys.argv[1]))
