# PWA — Aplikasi installable (iPhone & Android)

Folder ini berisi **shell PWA** yang membungkus dashboard Apps Script menjadi aplikasi
yang bisa di-install ke layar utama (ikon sendiri, layar penuh), di-host gratis lewat
**GitHub Pages**. Dashboard tetap satu sumber kode (Apps Script) — shell ini hanya
menampilkannya secara penuh layar.

```
GitHub Pages (shell PWA)  ──menampilkan──►  Web app Apps Script (dashboard)
   manifest + service worker + ikon              akses "Anyone" + kunci PIN
```

## Langkah pemasangan (sekali saja)

### 1. Siapkan Apps Script jadi publik + PIN
Karena diakses dari luar (PWA), web app perlu bisa dibuka tanpa login Google, dan
dikunci dengan PIN.
1. Pastikan semua modul `*.gs`, `Index.html`, `appsscript.json` sudah versi terbaru
   (`appsscript.json` sudah berisi `"access": "ANYONE_ANONYMOUS"`).
2. **Project Settings → Script properties**, tambahkan:
   - `ANTHROPIC_API_KEY` = API key Anda (sudah ada).
   - **`APP_PIN`** = PIN pilihan Anda (mis. `1234`). *Wajib diisi* karena web app jadi publik.
3. **Deploy → Manage deployments → ✏️ Edit**:
   - *Who has access* = **Anyone**
   - *Version* = **New version** → **Deploy**.
4. Salin **Web app URL** (berakhiran `/exec`).

> Tanpa `APP_PIN`, app terbuka tanpa kunci. Dengan `APP_PIN`, semua harus masukkan PIN,
> dan fungsi yang memakai API/menulis ke sheet menolak tanpa PIN benar.

### 2. Aktifkan GitHub Pages
1. Di GitHub repo → **Settings → Pages**.
2. **Source: Deploy from a branch**, pilih branch **`main`** dan folder **`/docs`** → Save.
   *(Lakukan setelah branch ini di-merge ke `main`, atau pilih branch tempat folder `docs` berada.)*
3. Tunggu beberapa menit; URL muncul, mis. `https://andwowor.github.io/keuangan-harian/`.

### 3. Hubungkan & install di HP
1. Buka URL GitHub Pages di HP.
2. Tempel **Web app URL** (`/exec`) tadi → **Simpan & Buka**. (Disimpan di perangkat itu.)
3. Pasang ke layar utama:
   - **iPhone (Safari):** tombol **Share** → **Add to Home Screen**.
   - **Android (Chrome):** menu **⋮** → **Install app** / **Add to Home screen**.
4. Buka dari ikon → masukkan **PIN** → siap dipakai (full-screen, seperti app).

## Catatan
- **Ganti URL:** ketuk tombol ⚙ di pojok kanan-bawah shell.
- **Keamanan:** endpoint web app publik tetapi dikunci PIN; fungsi pembacaan gambar
  (biaya API) & penyimpanan menolak tanpa PIN benar. Jaga kerahasiaan PIN & URL.
- **Offline:** shell (ikon/halaman) tersimpan agar app cepat dibuka; isi dashboard tetap
  perlu internet (butuh akses Sheets & Claude).
- **Ikon:** `icon-192.png` / `icon-512.png` (boleh Anda ganti dengan desain sendiri,
  ukuran sama).

## Kalau layar "tempel Web app URL" muncul lagi

URL disimpan di **localStorage** perangkat. Ia hilang bila penyimpanan aplikasi
dibersihkan (**Hapus data**, bukan "Hapus cache"), ganti HP, atau buka di browser lain.

Cara memulihkan: tempel ulang URL-nya. Ambil dari editor Apps Script →
**Deploy → Manage deployments → salin Web app URL** (berakhiran `/exec`).

**Agar tidak terulang:** isi konstanta `URL_BAWAAN` di `docs/index.html` dengan URL
tersebut. Bila diisi, layar setup tidak akan pernah muncul lagi — walau data aplikasi
terhapus atau dipasang di HP baru. Tombol ⚙ tetap bisa dipakai untuk mengganti URL.

> Catatan: mengisi `URL_BAWAAN` berarti URL `/exec` ikut tersimpan di repo. Dashboard
> tetap terlindungi `APP_PIN`, tetapi bila repo Anda publik, siapa pun bisa melihat
> alamatnya. Untuk repo privat hal ini tidak jadi masalah.
