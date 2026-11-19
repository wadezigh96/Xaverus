# Panduan: Menyiapkan Privy untuk Xaverus

Panduan ini untuk menyiapkan Privy, layanan login yang dipakai halaman
mint Xaverus. Dengan Privy, pengguna bisa masuk memakai email (lalu
otomatis dibuatkan dompet) atau memakai dompet yang sudah mereka punya
(OKX Wallet, MetaMask, dan dompet lain). Tanpa Privy, halaman mint tetap
jalan seperti biasa: pengguna mengetik alamat dompet sendiri.

Yang kamu butuhkan: browser dan alamat email. Tidak butuh kartu kredit —
paket gratis Privy sudah cukup untuk Xaverus.

> **Yang penting diingat:** App Secret Privy **tidak pernah** dibutuhkan
> Xaverus. Jangan pernah meminta, menyalin, atau membagikan App Secret —
> ke siapa pun, di chat mana pun. Yang dipakai hanya **App ID**, dan App
> ID itu kunci publik: aman dipakai di browser dan aman dibagikan.
> Panduan ini memakai placeholder `<App ID dari dashboard>`; jangan
> pernah menulis nilai App ID asli ke file yang masuk GitHub.

> **Kalau aplikasi Privy Xaverus sudah dibuat**, lewati ke
> [Langkah 4](#langkah-4-salin-app-id-ke-file-env-lokal).

## Langkah 1: Buat akun dan aplikasi di dashboard Privy

1. Buka https://dashboard.privy.io di browser.
2. Buat akun (atau masuk kalau sudah punya).
3. Tekan **Create app** (atau **+ New app**).
4. Isi nama aplikasi, misalnya `Xaverus`.
5. Tekan **Create** sampai aplikasi selesai dibuat.

## Langkah 2: Aktifkan login email + dompet

1. Di dashboard Privy, buka aplikasi Xaverus.
2. Buka halaman **Authentication** (pengaturan cara login).
3. Aktifkan **Email** — ini yang memungkinkan login pakai kode yang
   dikirim ke email.
4. Aktifkan **Wallet** — ini yang memungkinkan login pakai dompet
   eksternal (OKX Wallet, MetaMask, dan dompet lain).
5. Simpan pengaturannya.

Kode di Xaverus hanya menampilkan metode login yang sudah diaktifkan di
dashboard. Kalau Email tidak diaktifkan di sini, tombol login email tidak
akan muncul di halaman mint, meskipun kodenya sudah siap.

## Langkah 3: Tambahkan domain ke allowed domains

Privy hanya mengizinkan login dari domain yang kamu daftarkan. Daftarkan
domain produksi dan domain lokal:

1. Di dashboard Privy, buka pengaturan aplikasi Xaverus.
2. Cari bagian **Allowed domains** (domain yang diizinkan).
3. Tambahkan domain produksi:
   - `xaverus.vercel.app`
4. Tambahkan domain lokal (supaya bisa mencoba di komputer sendiri):
   - `localhost:3000`
5. Simpan pengaturannya.

Kalau domain tidak didaftarkan, login dari domain itu akan ditolak
Privy — lihat tabel masalah di bawah.

## Langkah 4: Salin App ID ke file env lokal

1. Di dashboard Privy, buka halaman aplikasi Xaverus dan cari **App ID**
   (biasanya tampil di halaman utama aplikasi atau di **Settings**).
2. Di folder repo Xaverus, buka file `.env.local` (buat baru kalau belum
   ada — file ini tidak masuk GitHub).
3. Tambahkan baris ini, dengan App ID dari dashboard:

   ```bash
   NEXT_PUBLIC_PRIVY_APP_ID=<App ID dari dashboard>
   ```

4. Simpan file. Jangan pernah memasukkan `.env.local` ke GitHub.
5. Jalankan ulang server lokal (`npm run dev`) supaya variabel baru
   terbaca.

## Langkah 5: Isi App ID di Vercel (produksi)

1. Buka dashboard Vercel, pilih proyek Xaverus.
2. Buka **Settings → Environment Variables**.
3. Tambahkan variabel ini (nilai App ID sama seperti Langkah 4):

   | Nama | Nilai |
   | --- | --- |
   | `NEXT_PUBLIC_PRIVY_APP_ID` | App ID dari dashboard Privy |

4. Simpan, lalu deploy ulang proyek supaya variabel baru dipakai.
5. Periksa: `xaverus.vercel.app` sudah ada di allowed domains
   (Langkah 3), kalau tidak login produksi akan ditolak.

## Langkah 6: Coba login di halaman mint

1. Buka halaman mint: `https://xaverus.vercel.app/mint`
   (atau `http://localhost:3000/mint` untuk lokal).
2. Di langkah pertama, tekan **Log in with email or wallet**.
3. Pilih **Email**: masukkan email, lalu masukkan kode sekali pakai
   (OTP) yang dikirim ke email itu. Kode hanya berlaku sebentar, jadi
   masukkan segera setelah email datang — kalau sudah kedaluwarsa,
   minta kode baru dari halaman login. Setelah login, sebuah dompet
   dibuat otomatis untukmu — tidak perlu menginstal apa pun.
4. Atau pilih dompet eksternal (misalnya **OKX Wallet**): setujui
   permintaan konek di dompetmu.
5. Setelah login, alamat dompet terisi otomatis di halaman mint dan
   tanda tangan klaim UID serta transaksi mint memakai dompet yang
   terhubung itu. Berhasil!

## Kalau ada masalah

| Gejala | Kemungkinan penyebab dan yang dilakukan |
| --- | --- |
| Tombol "Log in with email or wallet" tidak muncul | `NEXT_PUBLIC_PRIVY_APP_ID` belum terisi (cek `.env.local` untuk lokal, atau Environment Variables di Vercel untuk produksi), atau server belum di-restart / proyek belum di-redeploy setelah mengisi variabel. |
| Login ditolak / Privy bilang domain tidak diizinkan | Domain belum ditambahkan ke **Allowed domains** di dashboard Privy (Langkah 3). Tambahkan `xaverus.vercel.app` (dan `localhost:3000` untuk lokal), lalu coba lagi. |
| Kode email (OTP) tidak datang | Periksa folder spam. Kode hanya berlaku sebentar — kalau sudah kedaluwarsa, minta kode baru dari halaman login. |
| Login dompet eksternal gagal | Pastikan ekstensi dompet terpasang dan tidak terkunci, lalu coba lagi. Kalau kamu menolak popup persetujuan, tekan tombol login sekali lagi — penolakan bukan error. |
| Setelah login, halaman bilang dompet tidak di X Layer | Tekan tombol **Switch to X Layer** di halaman mint dan setujui perpindahan jaringan di dompetmu. |
| Halaman mint menampilkan pesan error dari Privy | Periksa App ID di `.env.local` / Vercel sudah benar dan tidak ada spasi atau karakter tambahan, lalu restart / redeploy. |

## Catatan keamanan

- App ID Privy adalah kunci publik: ia sengaja terlihat di kode halaman
  web dan aman dibagikan. Ia hanya mengidentifikasi aplikasi mana yang
  dipakai — ia bukan kata sandi.
- App Secret Privy adalah kunci server yang **tidak pernah** dibutuhkan
  Xaverus. Jangan pernah menyalin, membagikan, atau menempelkannya di
  mana pun. Kalau ada yang memintanya, jangan berikan.
- Xaverus tidak pernah meminta atau menyimpan kata sandi apa pun. Login
  email memakai kode sekali pakai yang dikirim Privy; login dompet
  memakai persetujuan di dompetmu sendiri.
- Embedded wallet (dompet yang dibuat otomatis saat login email) dibuat
  dan diamankan oleh Privy; Xaverus tidak pernah melihat kunci privatnya.
