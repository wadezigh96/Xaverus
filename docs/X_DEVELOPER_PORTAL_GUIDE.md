# Panduan: Membuat Aplikasi di X Developer Portal

Panduan ini untuk membuat aplikasi X yang dipakai fitur human-proof
minting Xaverus. Aplikasi ini yang memungkinkan pengguna menghubungkan
akun X.com mereka saat minting Safety Passport.

> **Status (19 Nov 2026): aplikasi Xaverus Mint sudah dibuat** dan
> pengaturan OAuth-nya sudah disimpan di portal (tipe Web App, Callback
> URI + Website URL + Terms of Service terisi). Client ID OAuth 2.0
> sudah dikonfirmasi dan dikonfigurasi lokal. Langkah-langkah di bawah
> tetap berlaku sebagai referensi — misalnya kalau pengaturan perlu
> diubah atau Client Secret perlu di-generate ulang — tapi kamu tidak
> perlu membuat aplikasi baru. Yang masih tersisa: mengisi Client Secret
> di Vercel (Langkah 7) dan verifikasi OAuth end-to-end di situs live
> setelah deploy.

Yang kamu butuhkan: akun X.com dan browser. Tidak butuh kartu kredit —
paket Free sudah cukup, karena Xaverus hanya membaca ID dan nama pengguna
akun (izin `tweet.read` dan `users.read` — keduanya hanya baca; X menolak
membaca profil kalau izinnya hanya `users.read`).

> **Yang penting diingat:** Client Secret itu rahasia. Jangan pernah
> ditempel di chat, jangan pernah di-commit ke GitHub. Client ID tidak
> rahasia, jadi aman dibagikan.

## Langkah 1: Buka X Developer Portal

1. Buka https://developer.x.com/ di browser.
2. Masuk dengan akun X.com kamu.

## Langkah 2: Buat Project

1. Di halaman utama portal, tekan tombol **Create Project** (atau
   **+ Create Project**).
2. Isi nama Project, misalnya `Xaverus`.
3. Pilih kegunaan Project: pilih yang paling mendekati, misalnya
   **Making a bot** atau **Exploring the API** — pilihan ini tidak
   memengaruhi cara kerja aplikasi.
4. Tekan **Next** sampai Project selesai dibuat.

## Langkah 3: Buat App di dalam Project

1. Di dalam Project yang baru dibuat, tekan **+ Add App** (atau
   **Create App**).
2. Isi nama App, misalnya `Xaverus Mint`.
3. Tekan **Create** / **Next** sampai App selesai dibuat.

## Langkah 4: Atur User authentication settings

1. Buka halaman App yang baru dibuat.
2. Cari bagian **User authentication settings**, lalu tekan **Set up**
   (atau **Edit** kalau sudah ada).
3. Aktifkan **OAuth 2.0**.
4. Pilih tipe App: **Web App, Automated App or Bot**.
   (Tipe Native juga bisa dipakai, tapi Web App adalah pilihan yang
   sesuai untuk Xaverus.)
5. Isi **Callback URI / Redirect URL** dengan alamat ini, persis sama
   (termasuk `/api/mint/x/callback` di ujungnya):
   - Untuk produksi (Vercel): `https://xaverus.vercel.app/api/mint/x/callback`
   - Untuk mencoba di komputer sendiri: `http://localhost:3000/api/mint/x/callback`
   - Kalau domain produksi kamu berbeda, ganti bagian depannya saja —
     ujungnya tetap `/api/mint/x/callback`.
   - Callback URL harus **persis** sama dengan yang nanti kamu isi di
     `X_REDIRECT_URI`. Satu huruf saja beda, X akan menolak login.
6. Isi **Website URL** dengan alamat aplikasi, misalnya
   `https://xaverus.vercel.app`.
7. Isi **Terms of Service URL** — wajib diisi. Kalau kolom ini kosong,
   X menolak penyimpanan dengan error 400 tanpa penjelasan. Isi dengan
   alamat aplikasi, misalnya `https://xaverus.vercel.app`, kalau belum
   ada halaman syarat layanan sendiri.
8. Tekan **Save**.

## Langkah 5: Ambil Client ID dan Client Secret

1. Di halaman App, buka tab **Keys and tokens**.
2. Di bagian **OAuth 2.0 Client ID and Client Secret**, tekan **Generate**
   (atau **Regenerate**) kalau belum ada.
3. Salin **Client ID** dan **Client Secret** yang muncul.
4. **Client Secret hanya ditampilkan sekali.** Simpan di tempat aman
   (misalnya password manager). Kalau hilang, kamu bisa generate ulang
   di halaman yang sama.

## Langkah 6: Isi environment variables (lokal)

1. Di folder repo Xaverus, buka file `.env.local` (buat baru kalau belum
   ada — file ini tidak masuk GitHub).
2. Tambahkan tiga baris ini, dengan nilai dari Langkah 5:

   ```bash
   X_CLIENT_ID=<Client ID dari portal>
   X_CLIENT_SECRET=<Client Secret dari portal>
   X_REDIRECT_URI=http://localhost:3000/api/mint/x/callback
   ```

3. Simpan file. Jangan pernah memasukkan `.env.local` ke GitHub.
4. Jalankan ulang server lokal (`npm run dev`) supaya variabel baru
   terbaca.

## Langkah 7: Isi environment variables (produksi, Vercel)

1. Buka dashboard Vercel, pilih proyek Xaverus.
2. Buka **Settings → Environment Variables**.
3. Tambahkan tiga variabel ini (nilai Client ID dan Client Secret sama
   seperti Langkah 5):

   | Nama | Nilai |
   | --- | --- |
   | `X_CLIENT_ID` | Client ID dari portal |
   | `X_CLIENT_SECRET` | Client Secret dari portal |
   | `X_REDIRECT_URI` | `https://xaverus.vercel.app/api/mint/x/callback` |

4. Simpan, lalu deploy ulang proyek supaya variabel baru dipakai.
5. Periksa: `X_REDIRECT_URI` di produksi harus persis sama dengan
   Callback URL yang kamu isi di portal pada Langkah 4.

## Langkah 8: Coba menghubungkan X

1. Buka halaman mint: `https://xaverus.vercel.app/mint`
   (atau `http://localhost:3000/mint` untuk lokal).
2. Masukkan alamat wallet, lalu tekan **Connect X**.
3. Browser pindah ke X.com. Tekan **Authorize app** untuk menyetujui.
4. Browser kembali ke halaman mint dengan status X **CONNECTED** dan
   X user ID tampil otomatis. Berhasil!

## Kalau ada masalah

| Gejala | Kemungkinan penyebab |
| --- | --- |
| Halaman mint menampilkan "X connection failed" | Periksa tiga variabel di `.env.local` / Vercel sudah terisi dan server sudah di-restart / di-redeploy. |
| X menampilkan error saat authorize | Callback URL di portal tidak persis sama dengan `X_REDIRECT_URI`. Bandingkan huruf per huruf. |
| Error 400 tanpa penjelasan saat menyimpan pengaturan di portal | Kolom **Website URL** atau **Terms of Service URL** kosong. Isi keduanya lalu simpan lagi. |
| Client Secret hilang | Generate ulang di tab **Keys and tokens**, lalu perbarui `X_CLIENT_SECRET` di `.env.local` dan Vercel. |

## Catatan keamanan

- Xaverus hanya meminta izin `tweet.read` dan `users.read`: membaca ID dan
  nama pengguna akun X. Keduanya hanya baca; aplikasi ini **tidak bisa**
  posting, membaca DM, atau mengubah akun kamu.
- Xaverus tidak pernah meminta atau menyimpan kata sandi X kamu. Login
  selalu terjadi di situs X.com sendiri, bukan di Xaverus.
- Client Secret hanya dipakai server untuk menukar kode otorisasi. Ia
  tidak pernah dikirim ke browser pengguna.
