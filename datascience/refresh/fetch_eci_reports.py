"""Download ECI statistical reports (XLSX) for the 2023-26 assembly elections and the 2024
Lok Sabha from eci.gov.in's public report listing (the same endpoint its report pages call).
Usage: python3 -I fetch_eci_reports.py (needs curl)   (writes into raw/eci/<category_id>/)"""
import json
import os
import re
import subprocess
import time

API = "https://www.eci.gov.in/eci-backend/public/api/election-result?category_id={}"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "eci")
# category_id -> state (assembly) ; 1 = Lok Sabha 2024
CATEGORIES = {
    1: "LS_2024", 2: "Andhra_Pradesh", 3: "Arunachal_Pradesh", 4: "Odisha", 5: "Sikkim",
    6: "Haryana", 7: "Jammu_&_Kashmir", 8: "Maharashtra", 9: "Jharkhand", 10: "Delhi",
    16: "Bihar", 23: "Assam", 24: "Kerala", 25: "Puducherry", 26: "Tamil_Nadu",
    28: "West_Bengal", 32: "Mizoram", 33: "Madhya_Pradesh", 34: "Rajasthan", 35: "Telangana",
}
# Reports needed: detailed results, electors and voters by gender, LS assembly segments
WANTED = re.compile(r"detailed result|voters information|number of electors|assembly segment of pc|pc wise voters turn ?out|participation of women electors", re.I)


def get(url: str) -> bytes:
    # curl with its own user agent (ECI's firewall rejects Python's default client)
    for attempt in range(4):
        r = subprocess.run(["curl", "-sfL", "-m", "300", url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout
        print("  retry", attempt + 1, r.returncode)
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(url)


manifest = []
for cid, name in CATEGORIES.items():
    listing = json.loads(get(API.format(cid)))
    d = os.path.join(OUT, f"{cid}_{name}")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "listing.json"), "w") as f:
        json.dump(listing, f, indent=1)
    for item in listing.get("results", []):
        if not WANTED.search(item["title"]) or not item.get("xlsx_url"):
            continue
        fn = re.sub(r"[^A-Za-z0-9._-]+", "_", item["title"].strip()) + ".xlsx"
        path = os.path.join(d, fn)
        if not os.path.exists(path):
            data = get(item["xlsx_url"])
            with open(path, "wb") as f:
                f.write(data)
            time.sleep(1)
        manifest.append({"category": cid, "name": name, "title": item["title"], "file": os.path.relpath(path, OUT), "url": item["xlsx_url"], "bytes": os.path.getsize(path)})
        print(cid, name, item["title"], os.path.getsize(path))
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
