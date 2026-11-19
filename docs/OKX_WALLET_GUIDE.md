# Panduan: Memakai OKX Wallet di Halaman Mint Xaverus

Panduan ini untuk menghubungkan OKX Wallet ke halaman mint Xaverus lewat
jalur native: satu tombol berbicara langsung ke ekstensi OKX Wallet di
browsermu, tanpa perantara. Jalur ini berdampingan dengan login Privy —
kamu bebas memakai salah satu; keduanya mengisi alamat dompet yang sama
di halaman mint.

Yang kamu butuhkan: browser desktop (Chrome atau yang sejenis) dan
ekstensi OKX Wallet. Kalau kamu memakai HP tanpa ekstensi, lihat bagian
[Di HP tanpa ekstensi](#di-hp-tanpa-ekstensi) di bawah.

## Langkah 1: Pasang ekstensi OKX Wallet

1. Buka halaman resmi OKX Wallet: https://web3.okx.com
   (atau langsung ke Chrome Web Store:
   https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge).
2. Pasang ekstensinya, lalu buat dompet baru atau impor dompet yang
   sudah kamu punya, mengikuti petunjuk di ekstensi.
3. Pastikan ekstensi aktif dan tidak terkunci.

> Unduh OKX Wallet hanya dari situs resmi OKX. Jangan memasang ekstensi
> dari tautan yang dikirim orang tak dikenal.

## Langkah 2: Buka halaman mint dan konek

1. Buka halaman mint: `https://xaverus.vercel.app/mint`
   (atau `http://localhost:3000/mint` untuk lokal).
2. Di langkah pertama, tekan **Connect OKX Wallet**.

## Apa yang terjadi di tiap langkah

1. **Permintaan konek.** Ekstensi OKX Wallet menampilkan popup yang
   meminta izin untuk terhubung ke Xaverus. Tekan setujui. Kalau kamu
   menolak, halaman menampilkan pesan sopan dan tombol yang sama bisa
   ditekan lagi kapan pun — penolakan bukan error, dan tidak ada popup
   kedua yang muncul sendiri.
2. **Pindah ke X Layer.** Setelah terhubung, aplikasi memindahkan
   dompetmu ke jaringan X Layer (chain 196), karena minting hanya
   berjalan di X Layer. Kalau X Layer belum ada di dompetmu, aplikasi
   memintamu menambahkannya dulu (nama jaringan, RPC, dan explorer
   diisi otomatis dari definisi X Layer yang dipakai aplikasi), lalu
   pindah ke jaringan itu. Setelah pindah, aplikasi memeriksa ulang
   bahwa dompetmu benar-benar di X Layer.
3. **Alamat terisi otomatis.** Alamat dompetmu muncul di kolom alamat
   halaman mint — tidak perlu mengetiknya sendiri, jadi tidak mungkin
   salah ketik.
4. **Tanda tangan klaim UID (langkah 3).** Saat kamu menandatangani
   klaim OKX UID, popup OKX Wallet muncul untuk meminta persetujuanmu.
   Tanda tangan ini hanya membuktikan kamu pemilik dompet; ia tidak
   memindahkan dana apa pun.
5. **Transaksi mint (langkah 4).** Saat kamu mint, popup OKX Wallet
   muncul dengan detail transaksi (memanggil factory mint). Kamu
   memeriksa dan menyetujuinya, lalu dompet mengirim transaksi ke
   X Layer.
6. **Ganti akun atau jaringan.** Kalau kamu mengganti akun atau jaringan
   di ekstensi OKX Wallet, halaman mint memperbarui tampilannya
   sendiri tanpa perlu me-refresh halaman. Kalau kamu pindah dari
   X Layer, halaman menampilkan tombol **Switch to X Layer** untuk
   kembali.

## Di HP tanpa ekstensi

Ekstensi browser tidak ada di HP, jadi tombol **Connect OKX Wallet**
tidak bisa bekerja di sana. Halaman mint menampilkan tautan ke halaman
unduhan resmi OKX Wallet (https://web3.okx.com) supaya kamu bisa
memasang aplikasi OKX Wallet. Untuk minting dari HP, cara termudah saat
ini adalah login lewat Privy dengan email (lihat
[docs/PRIVY_SETUP_GUIDE.md](PRIVY_SETUP_GUIDE.md)): dompet dibuat
otomatis, tanpa perlu menginstal apa pun.

Xaverus sengaja tidak memakai deep link `okx://` untuk membuka aplikasi
OKX Wallet: tidak ada sumber resmi OKX yang memverifikasi skema itu
untuk dipakai aplikasi pihak ketiga.

## Batas yang jujur: tanda tangan masih menunggu verifikasi live

Tanda tangan pesan di jalur ini memakai `personal_sign`, metode standar
EIP-1193. OKX menamai `personal_sign` di dokumentasi resmi SDK App
Wallet-nya, tetapi dokumentasi resmi ekstensi browsernya tidak menamai
metode itu — jadi tanda tangan live lewat ekstensi OKX Wallet **belum
terverifikasi** dan masih menjadi langkah terbuka (lihat TODO di
[docs/BUILD-X-SUBMISSION.md](BUILD-X-SUBMISSION.md)). Konek, pindah
jaringan, dan kirim transaksi memakai metode yang didokumentasikan
resmi untuk ekstensi. Tidak ada bagian dari panduan ini yang mengklaim
tanda tangan live sudah dicoba.

## Kalau ada masalah

| Gejala | Kemungkinan penyebab dan yang dilakukan |
| --- | --- |
| Halaman bilang OKX Wallet tidak terpasang, padahal sudah | Ekstensi belum aktif atau halaman dibuka sebelum ekstensi selesai dimuat. Aktifkan ekstensi, lalu refresh halaman mint. |
| Popup persetujuan tidak muncul | Mungkin ada permintaan lama yang masih menunggu di ekstensi — buka ikon OKX Wallet dan selesaikan atau tolak permintaan yang tertunda itu, lalu coba lagi. |
| Kamu menolak permintaan, lalu tombol tidak bisa ditekan | Tombol dinonaktifkan selama permintaan berjalan. Tunggu sampai permintaan selesai, lalu tekan lagi. |
| Halaman bilang dompet tidak di X Layer setelah konek | Tekan tombol **Switch to X Layer** dan setujui perpindahan di ekstensi. Kalau dompetmu menolak menambah jaringan, tambahkan X Layer secara manual di ekstensi (chain 196, RPC `https://rpc.xlayer.tech`), lalu tekan tombol itu lagi. |
| Halaman bilang OKX Wallet melaporkan dua jaringan berbeda | Dompet melaporkan jaringan yang berbeda lewat dua cara baca. Pindah jaringan di ekstensi ke X Layer secara manual, refresh halaman, lalu coba lagi. |
| MetaMask juga terpasang dan halaman bertingkah aneh | OKX Wallet dan MetaMask sama-sama mengisi `window.ethereum`, jadi keduanya bisa saling menutupi. Jalur native Xaverus memakai `window.okxwallet` sendiri dan tidak bergantung pada `window.ethereum`; kalau masalah berlanjut, nonaktifkan sementara salah satu ekstensi. |

## Catatan keamanan

- Xaverus tidak pernah meminta kata sandi dompetmu, seed phrase, atau
  kunci privat. Semua persetujuan terjadi di popup ekstensi OKX Wallet
  sendiri.
- Tanda tangan klaim UID tidak memindahkan dana. Transaksi mint hanya
  memanggil factory mint dan membutuhkan gas OKB — periksa selalu
  detail transaksi di popup sebelum menyetujui.
- OKX Wallet hanya mengizinkan konek setelah kamu menekan tombol dan
  menyetujui popup. Situs tidak bisa terhubung sendiri tanpa izinmu.
