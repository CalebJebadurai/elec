#!/bin/zsh
# Fetch the latest Internet Archive snapshot of every ECI state-wise result page (AMENDMENT-1.md).
cd "$(dirname "$0")/new_data_raw/eci" && mkdir -p pages
get() { # url outfile ; retries on throttling
  for i in 1 2 3 4 5 6; do
    curl -s --max-time 120 "$1" -o "$2"
    if [ -s "$2" ] && ! grep -q "Temporarily Offline" "$2"; then return 0; fi
    sleep $((i * 30))
  done
  return 1
}
while read folder code pages; do
  for n in $(seq 1 $pages); do
    url="results.eci.gov.in/$folder/statewise$code$n.htm"
    ls pages/${folder}_statewise$code${n}_*.htm >/dev/null 2>&1 && continue
    get "http://web.archive.org/cdx/search/cdx?url=$url&fl=timestamp&filter=statuscode:200" cdx.tmp || { echo "CDX FAIL $url"; continue; }
    ts=$(tail -1 cdx.tmp | tr -d '[:space:]')
    [ -z "$ts" ] && { echo "NO SNAPSHOT $url"; continue; }
    sleep 2
    get "http://web.archive.org/web/${ts}id_/https://$url" "pages/${folder}_statewise$code${n}_$ts.htm" && echo "ok $folder $code $n $ts" || echo "FETCH FAIL $url"
    sleep 2
  done
done <<LIST
AcResultGenDecNew2023 S12 12
AcResultGenDecNew2023 S16 2
AcResultGenDecNew2023 S20 10
AcResultGenDecNew2023 S26 5
AcResultGenDecNew2023 S29 6
AcResultGenJune2024 S01 9
AcResultGenJune2024 S18 8
AcResultGen2ndJune2024 S02 3
AcResultGen2ndJune2024 S21 2
AcResultGenOct2024 S07 5
AcResultGenOct2024 U08 5
ResultAcGenNov2024 S13 15
ResultAcGenNov2024 S27 5
ResultAcGenFeb2025 U05 4
ResultAcGenNov2025 S04 13
ResultAcGenMay2026 S03 7
ResultAcGenMay2026 S11 7
ResultAcGenMay2026 S22 12
ResultAcGenMay2026 S25 15
ResultAcGenMay2026 U07 2
LIST
echo DONE
