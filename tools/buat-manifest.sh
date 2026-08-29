#!/usr/bin/env bash
# Membuat sync-manifest.json: daftar berkas yang ditarik proyek Apps Script dari repo ini.
# WAJIB dijalankan ulang setiap kali ada berkas .gs baru/dihapus atau VERSI_APP dinaikkan.
# Ketidakcocokan versi terdeteksi saat sinkron (periksaBerkasSinkron_) sehingga manifest
# yang lupa diperbarui menggagalkan sinkron, bukan diam-diam memasang versi lama.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSI=$(grep -oP "var VERSI_APP = '\K[^']+" 00_config.gs)
CABANG=$(grep -oP "var GITHUB_BRANCH = '\K[^']+" 00_config.gs)

{
  printf '{\n  "versi": "%s",\n  "cabang": "%s",\n  "dibuat": "%s",\n  "berkas": [\n' \
    "$VERSI" "$CABANG" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ls *.gs Index.html appsscript.json | sort | awk '{ printf "%s    \"%s\"", (NR>1 ? ",\n" : ""), $0 } END { print "" }'
  printf '  ]\n}\n'
} > sync-manifest.json

python3 -c "import json,sys; d=json.load(open('sync-manifest.json')); print('sync-manifest.json OK: versi', d['versi'] + ',', len(d['berkas']), 'berkas')"
