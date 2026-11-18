# Riset TapeOut untuk Xaverus (Build X Series)

> **Tanggal riset:** 19 November 2026
> **Status:** Riset dari dokumen dan sumber publik saja. Tidak ada transaksi, deploy, atau
> pemanggilan kontrak yang dieksekusi selama riset ini — semua klaim di bawah bersumber dari
> bacaan, bukan dari pengujian langsung oleh kami.
> **Konteks:** Xaverus ikut lomba OKX X Layer Build X Series ("X Layer TapeOut Accelerate").
> Syarat lomba: proyek harus memakai TapeOut (sirkuit, kontrak, atau data onchain TapeOut di
> X Layer, atau berjalan di X Layer DeWEB). Tenggat submit: 7 Desember 2026 pukul 23.59 UTC
> (= 8 Desember 2026 pukul 06.59 WIB), masih berstatus provisional di halaman resmi.

---

## Ringkasan rekomendasi

**TapeOut itu apa, singkatnya:** protokol yang mengubah gerbang logika digital (NAND dan
LATCH) menjadi aset on-chain. Transistor adalah token ERC-1155, sirkuit adalah NFT ERC-721,
dan sirkuit bisa dievaluasi siapa saja secara read-only dan gratis lewat pemanggilan
`eval()` ke kontrak prosesor. Satu sirkuit terikat ke satu "container" (akun ERC-6551) yang
bisa menyimpan satu situs web utuh di on-chain (inilah yang disebut DeWEB).

**Rekomendasi untuk fitur "human-proof minting" Xaverus:**

1. **Opsi utama (paling realistis): penjangkaran data on-chain + satu sirkuit kebijakan kecil.**
   - Tape out satu sirkuit NAND kecil (puluhan–ratusan gerbang) yang mengimplementasikan
     cek kebijakan deterministik sederhana, misalnya: "mint diizinkan jika flag
     terverifikasi-X = 1 DAN flag klaim-OKX-UID = 1 DAN jumlah mint hari ini < batas".
     Sirkuit ini dipanggil read-only lewat `eval()` dari frontend/kontrak Xaverus.
   - Simpan bukti verifikasi (hash handle X, hash UID OKX, tanda tangan dompet, stempel
     waktu) sebagai file JSON di container sirkuit itu lewat SiteRegistry — ini adalah
     "data onchain TapeOut" yang bisa diverifikasi siapa saja lewat SHA-256 on-chain.
     Catatan (19 Nov 2026, perbaikan code-review): format anchor final (v2) TIDAK
     menyimpan tanda tangan mentah — file publik on-chain hanya berisi hash, dan tanda
     tangan tetap server-side bersama proof. Lihat docs/TAPEOUT_ANCHORING.md §2.
   - Kombinasi ini memenuhi syarat lomba ("menggunakan sirkuit, kontrak, atau data onchain
     TapeOut di X Layer") dengan klaim yang jujur dan bisa dikerjakan dalam ~2 minggu.
2. **Opsi pendukung (opsional):** publikasikan satu halaman statis penjelasan verifikasi /
   penampil paspor sebagai situs DeWEB (`<id>.2.<prosesor>.tape`) memakai alur TapeKit.
   Bagus sebagai bukti "berjalan di DeWEB", tapi tidak bisa menggantikan aplikasi Next.js
   (DeWEB hanya statis, tanpa server).
3. **Yang TIDAK realistis:** memverifikasi OAuth X.com atau UID OKX *di dalam* sirkuit.
   Sirkuit TapeOut tidak punya akses jaringan, tidak bisa memanggil API X/OKX, dan tidak
   bisa memverifikasi identitas. Sirkuit hanya menghitung logika boolean dari bit input
   yang diberikan — kejujuran input tetap bergantung pada pihak yang mengenkode input.
   Jangan klaim sirkuit "membuktikan kemanusiaan"; yang bisa diklaim adalah sirkuit
   "menegakkan aturan kebijakan secara terbuka dan bisa diperiksa siapa saja".
4. **Jangan jadikan draf TAP sebagai fondasi.** Draf "Policy Circuit Gate" dan "Agent
   Passports" di repo TAPs sangat relevan secara konsep (bahkan membahas batas belanja agen
   sebagai sirkuit), tapi keduanya masih draf yang belum di-merge, dan fungsi on-chain yang
   mereka butuhkan (`evalFile`/`stepFile`) belum terkonfirmasi ter-deploy.

**Biaya kasar (mainnet X Layer, dari sumber):** tape-out sirkuit 3.829 gerbang menelan biaya
bersih sekitar 0,0023 OKB pada Oktober 2026; membuka container tercatat 0,08 OKB di X Layer
(data September 2026). Jadi satu sirkuit kecil + container kemungkinan menelan biaya jauh
di bawah 0,5 OKB. Tetap butuh OKB mainnet sungguhan — **tidak ada testnet TapeOut** yang
ditemukan.

---

## 1. Apa itu TapeOut?

TapeOut adalah protokol "manufaktur perangkat keras on-chain": desain, fabrikasi,
verifikasi, dan komposisi sirkuit digital dipindahkan ke blockchain. Diluncurkan 15 Agustus
2026 oleh pengembang dengan nama akun @Blonskr. Bukti awalnya adalah Behemoth, CPU 4-bit
on-chain yang meniru spesifikasi Intel 4004 (1971).

Sumber: whitepaper resmi (bahasa Mandarin),
[TapeOut-Protocol.pdf](https://tapeout.net/TapeOut-Protocol.pdf);
[tapeout.net](https://tapeout.net/);
[ODaily: An In-Depth Overview of the TapeOut Ecosystem](https://www.odaily.news/en/post/5213070).

### Arsitektur singkat

| Lapisan | Bentuk on-chain | Keterangan |
| --- | --- | --- |
| Transistor (NAND, LATCH) | Token ERC-1155 (fungible) | NAND = gerbang logika dasar (satu-satunya gerbang yang dibutuhkan — semua logika bisa dibangun dari NAND); LATCH = sel memori 1 bit. |
| Sirkuit | NFT ERC-721 | Netlist (daftar "gerbang mana tersambung ke gerbang mana") yang diabadikan on-chain. Membakar transistor sejumlah gerbang → lahir satu Circuit NFT. |
| Prosesor | Kontrak hasil kloning factory | "Pabrik" tempat sirkuit di-tape-out. Setiap prosesor punya harga transistor dan stok sendiri. Semua prosesor hasil kloning factory punya bytecode identik, sehingga sirkuit di prosesor mana pun bisa saling memanggil. |
| Container | Akun ERC-6551 milik Circuit NFT | Setiap sirkuit punya satu container; di sinilah file situs DeWEB disimpan. Pemegang NFT mengendalikan container. |
| Evaluasi | `eval(tokenId, bits)` read-only | Siapa pun bisa menjalankan sirkuit tanpa wallet dan tanpa biaya (panggilan read-only). Kontrak lain juga bisa memanggil sirkuit sebagai bagian dari logikanya — whitepaper menegaskan sirkuit tidak bisa memanggil kontrak lain atau menulis state, sehingga "paling buruk hanya mengembalikan jawaban yang salah". |

**Alur ekonomi (Proof of Design / PoD):** pengembang mengirim sirkuit untuk menyelesaikan
tugas yang ditentukan; setelah terverifikasi, sirkuit bisa didaftarkan sebagai "mesin
penambang" yang berhak atas imbalan token `$BEM` (total suplai 21 juta, diluncurkan di BNB
Chain 21 Agustus 2026). PoD relevan untuk insentif, bukan untuk integrasi teknis Xaverus.

**Rantai yang didukung:** BNB Smart Chain (56), X Layer (196), Base (8453). Nama on-chain
memakai kode area: `<#ID>.<prosesor>` di BNB, `<#ID>.2.<prosesor>` di X Layer,
`<#ID>.3.<prosesor>` di Base, ditambah akhiran `.tape` (contoh X Layer: `1.2.0.tape`).
Sumber: [TapeKit README — Mainnet constants](https://github.com/TapeOutProtocol/TapeKit).

**Status keamanan / tata kelola (penting untuk kejujuran submission):**

- 22 Oktober 2026: prosesor TapeOut "dibekukan" di ketiga chain — beacon prosesor sudah
  tidak punya owner, jadi kode prosesor yang sudah ada tidak bisa diubah lagi. Namun
  **factory-nya sendiri masih bisa di-upgrade**.
  Sumber: [TapeKit README — Status and roadmap](https://github.com/TapeOutProtocol/TapeKit).
- Kontrak SiteRegistry di BNB Chain (per pemeriksaan read-only independen 14 November 2026)
  admin-nya adalah wallet kunci tunggal biasa, bukan multisig, dan belum melepaskan kontrol
  — artinya catatan file secara prinsip bisa diubah lewat upgrade.
  Sumber: [21 NAND docs — Check it yourself](https://nand.aihashrate.stream/en/start/verify.html).
- TapeKit (kernel + gateway) **belum diaudit independen**.
  Sumber: [TapeKit README](https://github.com/TapeOutProtocol/TapeKit).
- Situs resmi tapeout.net menyatakan protokol v2.0 masih dalam pengembangan dan belum
  di-deploy, sehingga kontrak factory saat ini tetap upgradeable di bawah multisig 3/5.
  Sumber: [tapeout.net](https://tapeout.net/) (bagian pernyataan hukum di bawah halaman).

**Jangan tertukar:** token `TAPEOUTX` di X Layer adalah token terpisah yang tidak terkait
dengan TapeOut Protocol (token protokolnya adalah `$BEM`).
Sumber: [Bitrue — TapeOut X (TAPEOUTX)](https://www.bitrue.com/blog/tapeout-x-tapeoutx-price-contract-address-how-to-buy).

### Tautan resmi utama

| Sumber | Tautan |
| --- | --- |
| Situs resmi TapeOut | https://tapeout.net/ |
| Whitepaper / manifesto | https://tapeout.net/TapeOut-Protocol.pdf |
| Organisasi GitHub resmi (TapeOut Labs) | https://github.com/TapeOutProtocol |
| Repo TapeKit (kernel browser + TapeSend) | https://github.com/TapeOutProtocol/TapeKit |
| Repo TAPs (usulan standar protokol) | https://github.com/TapeOutProtocol/TAPs |
| Gateway TapeKit | https://tapekit.org/ |
| Halaman lomba resmi OKX | https://web3.okx.com/xlayer/build-x-series |
| Dokumen X Layer (OKX) | https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints |

### Kontrak TapeOut di X Layer (chain 196)

Dari README TapeKit (bagian "Mainnet constants") dan dokumen 21 NAND (bagian "Contract
addresses"). **Verifikasi keberadaan (19 Nov 2026, read-only):** keenam alamat di bawah
dicek lewat `cast code --rpc-url https://rpc.xlayer.tech` dan semuanya mengembalikan
bytecode (factory 262 karakter hex, container opener 5.210, SiteRegistry 354/proxy,
DomainBinding 354/proxy, DeWebHub 158/proxy, implementasi DeWebHub 25.402) — jadi
kontrak-kontrak itu benar ada di X Layer mainnet. Yang masih belum terverifikasi adalah
perilaku/ABI masing-masing (mis. bentuk pasti `eval()` untuk pemanggilan antar-kontrak)
— wajib divalidasi sebelum dipakai di kode.

| Kontrak | Alamat di X Layer |
| --- | --- |
| Processor factory | `0x1f09DAeFA827f02CBb40967cc91b259763760761` |
| Container opener | `0x536adD8F30f03b69f6fbF29d425A816A0dC50106` |
| SiteRegistry (proxy) | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` |
| DomainBinding (proxy) | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` |
| DeWebHub / TapeSend hub (proxy) | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` (implementasi X Layer menurut 21 NAND: `0xdCC57797089eBD9f26e686379A4323f353a3F9C6`) |

Sumber: [TapeKit README](https://github.com/TapeOutProtocol/TapeKit),
[21 NAND docs — Contract addresses](https://nand.aihashrate.stream/en/reference/contracts.html).

---

## 2. Cara developer mengintegrasikan TapeOut

### 2.1 Sirkuit: bahasa dan alur kerja

Tidak ada bahasa pemrograman khusus TapeOut. Logika ditulis sebagai **netlist NAND-only**
(daftar gerbang + sambungan kabel antar gerbang). Alur yang didokumentasikan:

1. **Tentukan komputasi kecil** dengan hasil yang jelas — contoh: penjumlahan dua angka
   8-bit (~70 gerbang), pembanding dua angka, atau lookup tabel kecil.
2. **Tulis netlist NAND-only.** Bisa menulis logika dulu dalam **Verilog**, lalu memakai
   tool sintesis open-source **Yosys** untuk mengubahnya menjadi netlist NAND-only. Uji
   semua input di komputer sendiri sebelum naik on-chain.
3. **Pilih prosesor.** Prosesor adalah "pabrik" di TapeOut; masing-masing punya harga
   transistor dan sisa stok. Beli transistor sejumlah gerbang sirkuitmu.
4. **Tape out.** Lewat wallet, tulis netlist on-chain dalam satu transaksi. Setelah selesai,
   sirkuit mendapat nomor (misalnya `3.2.245`) dan satu Container account.
5. **Jalankan dan periksa.** Menjalankan sirkuit on-chain secara read-only gratis; siapa
   pun bisa memanggil dan memeriksa hasilnya.

Alternatif tanpa kode: **Canvas** di tapeout.net — seret-letak komponen NAND/LATCH di
browser, simulasi berjalan lokal dan gratis sampai puas, baru tape-out.
Sumber: [21 NAND docs — Build a small circuit](https://nand.aihashrate.stream/en/build/),
whitepaper §3.

**Batasan ukuran:** satu sirkuit harus ditulis dalam satu transaksi. Di BNB Chain, batas
gas per transaksi 16.777.216 (BEP-652) dengan ~2.900 gas per gerbang NAND membatasi sirkuit
sampai ~5.700 gerbang. Angka setara untuk X Layer **tidak ditemukan** dalam riset ini —
perlu dicek (lihat §8). Evaluasi read-only `eval()` diukur komunitas sekitar 2.468 gas per
gerbang (bukan angka resmi protokol).
Sumber: [21 NAND docs — Build a small circuit](https://nand.aihashrate.stream/en/build/),
[TAPI-25 §3](https://github.com/brucelanlan/tapeapi/blob/HEAD/spec/TAPI-25.md).

### 2.2 Hello world minimal (sirkuit)

```text
1. Tulis adder 8-bit (atau komparator) dalam Verilog.
2. Yosys: sintesis ke netlist NAND-only; simulasi lokal semua input.
3. Di tapeout.net, pilih prosesor X Layer, beli transistor = jumlah gerbang.
4. Tape out lewat wallet (butuh sedikit OKB) → dapat Circuit ID + container.
5. Verifikasi read-only dengan Foundry cast (contoh pola dari 21 NAND docs):

   cast call <alamat-kontrak-prosesor> \
     "eval(uint256,bytes)(bytes)" <circuit-id> 0xff7f \
     --rpc-url https://rpc.xlayer.tech
```

Contoh nyata yang terdokumentasi: sirkuit #279 ("21 gates that drive") di BNB Chain
dijalankan dengan `cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38
"eval(uint256,bytes)(bytes)" 279 0xff7f`.
Sumber: [21 NAND docs — Check it yourself](https://nand.aihashrate.stream/en/start/verify.html).

### 2.3 Kontrak di X Layer memanggil sirkuit

Whitepaper (§5) menyatakan kontrak mana pun di chain yang sama bisa memakai sirkuit sebagai
bagian dari logikanya lewat pemanggilan `eval()`. Laporan mingguan ekosistem 12–18 Oktober
2026 juga mencatat "smart contracts on X Layer can directly call the circuit an NFT is
bound to". Namun: **tidak ditemukan contoh kode resmi / ABI kanonis yang terdokumentasi
untuk pemanggilan antar-kontrak ini** — spesifikasi TAPI-25 menyebut ABI `eval()` yang
normatif masih TODO dan angka yang ada berasal dari "pengukuran komunitas".
Sumber: [whitepaper](https://tapeout.net/TapeOut-Protocol.pdf),
[TapeOut Ecosystem Weekly Report Oct 12–18](https://teletype.in/@wessd6/tapeoutweekrep?utm_source=teletype&utm_medium=feed_atom&utm_campaign=wessd6),
[TAPI-25](https://github.com/brucelanlan/tapeapi/blob/HEAD/spec/TAPI-25.md).

Implikasi praktis: untuk Xaverus, cara paling aman adalah memanggil `eval()` secara
read-only dari backend/frontend (off-chain) dan/atau dari kontrak hanya setelah ABI-nya
dikonfirmasi lewat pembacaan kontrak prosesor yang sebenarnya. Jangan mengasumsikan ABI
dari dokumen sekunder.

### 2.4 Data on-chain (DeWEB / SiteRegistry)

Satu situs web utuh disimpan di kontrak SiteRegistry di bawah nama container sirkuit.
Setiap file mencatat ukuran, tipe konten, dan SHA-256 yang dideklarasikan pemilik; pembaca
memverifikasi setiap byte terhadap hash itu.

Alur publikasi (dari Site Owner Handbook TapeKit):

1. Punya sirkuit (NFT) dan container-nya sudah **dibuka** (lewat container opener; konsol
   HashPort melakukan ini untukmu).
2. Siapkan folder statis: `index.html` di root, aset di subfolder, path relatif, nama file
   ASCII (NFC). Tanpa kode server.
3. Publikasikan lewat konsol HashPort (hosted, tanda tangan wallet) **atau** lewat
   pemanggilan kontrak langsung:
   - `putFile(container, path, contentType, sha256Hash, firstChunk)` — chunk pertama
     ≤ 24.000 byte; kalau file sudah ada, ini **mengganti** seluruhnya.
   - `appendChunk(container, path, expectIndex, chunk)` per chunk 24.000 byte.
   - Opsional `setFallback(container, path)` untuk SPA (rute tanpa ekstensi jatuh ke
     `index.html`).
   - `removeFile(container, path)` untuk menghapus.
4. **Aktivasi nama:** klien yang mengikuti spesifikasi hanya menampilkan situs yang namanya
   sudah diaktivasi — pembayaran di kontrak DomainBinding. Harga yang tercantum di README
   TapeKit adalah `monthlyFee` = 0,08 BNB per 30 hari (harga BNB Chain; harga untuk X Layer
   tidak tercantum — lihat §8). Satu pembayaran per container; sisa waktu ikut berpindah
   kalau NFT dijual.

Batasan (SPEC §5–§6): chunk 24.000 byte; satu file maks 350 chunk = 8.400.000 byte; klien
menampilkan maks 5.000 path; baca per panggilan 96 KB. Setiap chunk di-deploy sebagai
kontrak kecil, jadi biaya kira-kira sebanding dengan jumlah byte (~200 gas per byte kode
yang di-deploy + overhead) — **minify dan kompres dulu; jangan publikasikan source map
atau `node_modules`**.

Catatan: TapeRelay (diumumkan 18 November 2026, masih fase uji ~2 minggu di X Layer
mainnet) memperluas batas satu file dari 8,4 MB menjadi ~1 PiB lewat penyimpanan off-chain
di node relay, dengan pesan tanpa gas dan penyimpanan berbayar `$BEM` di atas jatah gratis
5 GiB per sirkuit per node. Namun file/hash TIDAK dicatat on-chain di TapeRelay — hanya
daftar node, kunci publik enkripsi, dan data pembayaran. Untuk kebutuhan Xaverus (bukti
yang bisa diverifikasi on-chain), SiteRegistry tetap jalur yang tepat.
Sumber: [TapeKit README — Site owner handbook](https://github.com/TapeOutProtocol/TapeKit),
[KuCoin Insight — TapeRelay](https://www.kucoin.com/news/insight/X/6afd698a9278e40007d87d41).

### 2.5 DeWEB

DeWEB = situs/aplikasi yang file-nya hidup sepenuhnya on-chain di container sirkuit,
dibaca langsung dari chain dan diverifikasi per byte (TapeKit), tanpa DNS, tanpa server.
Bisa dibuka lewat nama `tape://<id>.<prosesor>.tape`, lewat gateway TapeKit
(`https://<id>-<prosesor>.tapekit.org/`), lewat ekstensi browser, atau lewat domain biasa
yang diikat ke container (domain binding, diluncurkan TapeCode 13 Oktober 2026 — akses
domain biasa tetap bergantung DNS dan layanan gateway; verifikasi on-chain independen
butuh klien yang mendukung aturan verifikasi TapeKit).
Sumber: [TapeKit README](https://github.com/TapeOutProtocol/TapeKit),
[TapeOut Ecosystem Weekly Report Oct 12–18](https://teletype.in/@wessd6/tapeoutweekrep?utm_source=teletype&utm_medium=feed_atom&utm_campaign=wessd6).

---

## 3. FabX, TapeCode, TapeKit, TapeSend

Halaman lomba menyebut keempatnya sebagai contoh kemampuan ekosistem ("penggunaan proyek
atau tool tertentu tidak diwajibkan").

### FabX — miner komunitas TapeOut di X Layer

- Situs: [fabx.tech](https://fabx.tech/). Pemenang pertama TapeOut Genesis Transistor
  Hackathon.
- "Miner komunitas pertama untuk TapeOut di X Layer": mekanisme mining `$FAB` (7.200 FAB
  per hari; 99% untuk miner terverifikasi). Semakin ramping desain sirkuit dan semakin
  populer DeWEB yang terikat, semakin banyak `$FAB` yang ditambang. Hashrate = (burn basis
  + design premium) × bobot prosesor. Ada akselerasi lewat staking BEM dan OKB.
- **Relevansi untuk Xaverus: rendah.** FabX adalah lapisan insentif/mining, bukan tool
  integrasi. Satu-satunya kaitan: kalau Xaverus mempublikasikan DeWEB yang ramai dikunjungi,
  itu bisa menaikkan bobot mining miner yang terikat — bukan sesuatu yang dibutuhkan fitur
  human-proof minting. Tidak perlu dipakai.

### TapeCode — tool pengembangan AI untuk DeWEB

- Tool AI resmi ekosistem TapeOut: menghasilkan aplikasi dari bahasa natural, me-review
  kode otomatis, membuat circuit container, dan men-deploy smart contract + situs on-chain
  dalam satu klik. Mendukung mengubah aturan game menjadi sirkuit on-chain dengan verifikasi
  saat game dimulai.
- 12 Oktober 2026: lolos penetration test oleh firma keamanan Salus. 13 Oktober 2026:
  meluncurkan domain binding (domain biasa → container on-chain). Selama program akselerator
  X Layer × TapeOut, setiap top-up kredit komputasi TapeCode mendapat bonus +50% (tanpa
  batas, sampai akhir 2026, biayanya ditanggung Blonskr pribadi).
- **Tidak ditemukan URL situs resmi / dokumentasi mandiri TapeCode** dalam riset ini
  (pencarian hanya mengembalikan laporan mingguan dan post X). Kemungkinan diakses lewat
  tapeout.net atau aplikasi tersendiri — perlu ditanyakan di kanal Telegram dukungan lomba.
- **Relevansi untuk Xaverus: sedang-rendah.** TapeCode adalah tool bantu membangun (AI
  coding + deploy), bukan komponen runtime yang dipakai aplikasi. Xaverus sudah punya
  codebase Next.js + Foundry sendiri; memakai TapeCode untuk men-generate ulang aplikasi
  tidak masuk akal. Potensi kegunaan: mempercepat pembuatan halaman DeWEB statis pendamping
  atau men-deploy kontrak lewat alurnya — tapi tanpa dokumentasi resmi yang bisa dibaca,
  jangan jadikan ini jalur kritis.

### TapeKit — kernel browser open-source untuk DeWEB (PALING RELEVAN)

- Repo resmi: [github.com/TapeOutProtocol/TapeKit](https://github.com/TapeOutProtocol/TapeKit)
  (MIT untuk kode, CC0 untuk teks spesifikasi; dibuat 13 September 2026; 27 commit saat
  riset ini).
- Isi repo: `kernel/` (`@tapekit/kernel`, modul ES tanpa dependensi — resolusi nama,
  kesepakatan multi-node, verifikasi SHA-256 per file, cache), `sw-gateway/` (gateway
  Service Worker agar browser biasa membuka situs on-chain), `extension/` (ekstensi Chrome
  MV3), `viewer/` (penampil mode pratinjau), `send/` + `apps/tapesend/` (TapeSend),
  `SPEC.md` (spesifikasi `tape://` v0.2, 13 September 2026 — normatif untuk BNB Chain;
  konstanta X Layer/Base ada di `kernel/src/config.js`).
- **Cara pakai singkat (dari README):**
  ```js
  import { createKernel } from './kernel/src/index.js';
  const kernel = createKernel();                       // default: 4 node publik, 2 harus sepakat
  const res = await kernel.resolve('1.2.0.tape');      // status 'ok' | 'unpaid' | ...
  const site = await kernel.openSite(res);             // hanya manifest
  const file = await site.get('index.html');           // byte terverifikasi vs SHA-256 on-chain
  ```
  Belum ada rilis npm (`@tapekit/kernel` di npm masih ada di roadmap) — import langsung
  dari repo. Tes: `npm test` (unit, offline), `npm run test:mainnet` (read-only mainnet,
  tanpa kunci/transaksi), `npm run dev:gateway` (gateway lokal di port 8096).
- **Relevansi untuk Xaverus: tinggi.** TapeKit adalah cara kanonis untuk (a) membaca dan
  memverifikasi data on-chain TapeOut dari aplikasi kita, dan (b) mempublikasikan +
  memverifikasi situs DeWEB pendamping. Kernel-nya bisa dipakai di Node/Next.js untuk
  membaca file bukti dari container sirkuit kita dengan verifikasi hash.

### TapeSend — lapisan pesan DeWEB

- Pesan antar-container, tercatat di inbox on-chain di chain pengirim; identitas = container
  sirkuit; endpoint membawa chain ID sehingga satu alamat berlaku lintas chain. Spesifikasi
  TAP-10 (draf v0.5, 17 September 2026). Hub DeWebHub live di BNB Chain (dan menurut 21 NAND
  docs juga ter-deploy di X Layer dan Base, alamat proxy sama).
  Setiap pesan TapeSend ditulis on-chain dan dikenakan gas (berbeda dengan TapeRelay yang
  pesan-nya tanpa gas tapi off-chain).
- Kode ada di repo TapeKit (`send/`, `send/contracts/` — proyek Foundry dengan unit, fuzz,
  invariant, dan fork test; `send/module/` = `@tapekit/send`; `apps/tapesend/` = klien web,
  desktop Electron, iOS/Android Capacitor).
- **Relevansi untuk Xaverus: rendah.** TapeSend adalah infrastruktur pesan antar-container
  (chat antar agen/situs). Fitur human-proof minting tidak butuh pengiriman pesan antar
  container. Tidak perlu dipakai, kecuali di masa depan ada kebutuhan notifikasi antar-agen.

### Sebutan terkait lain

- **TapeAPI** (komunitas, bukan resmi protokol): lapisan layanan/API di atas TapeOut —
  identitas layanan on-chain, jawaban bertanda tangan yang bisa diverifikasi, dukungan MCP.
  Repo [github.com/BruceLanLan/tapeapi](https://github.com/brucelanlan/tapeapi), SDK
  `@tapeapi/sdk` v3.0.0 (6 November 2026), belum ada di npm (instal dari tarball rilis
  GitHub). Relevansi: sedang — pola "jawaban layanan bertanda tangan yang terikat ke
  container sirkuit" mirip dengan yang Xaverus butuhkan untuk bukti verifikasi, tapi TapeAPI
  berorientasi BNB Chain dan escrow pembayaran-nya belum di-deploy. Lebih berguna sebagai
  referensi desain daripada dependensi.
- **TapeRelay** (baru, 18 November 2026): jaringan penyimpanan file besar + pesan terenkripsi
  di X Layer mainnet, fase uji ~2 minggu, klien npm `@taperelay/client` dan
  `@tapestore/client`. Relevansi: rendah untuk saat ini (masih fase uji, data off-chain).
- **TAPs** (repo usulan standar): tujuh draf sudah di-merge sebagai Draft (TAP-11, TAP-13
  s.d. TAP-18; "merge bukan adopsi") dan tujuh lagi dalam peninjauan. Dua draf yang sangat
  relevan secara konsep untuk Xaverus — keduanya dari BruceLanLan, keduanya **belum
  di-merge** (per 24 Oktober 2026):
  - *Policy Circuit Gate* ([PR #84](https://github.com/TapeOutProtocol/TAPs/pull/84)):
    batas belanja agen ditulis sebagai sirkuit kecil (`tapnet/1`, maks 49.152 byte, 128 pin
    input, 8 pin output); input membawa satu "request word" (jumlah, kelas aset, kelas
    counterparty, jenis request, indeks hari UTC, jam, hari dalam minggu); binding lewat
    pernyataan EIP-712 `PolicyBinding`. Verifikasi off-chain dengan evaluator referensi
    TAP-02, atau on-chain lewat `evalFile`/`stepFile` "bila policynya kecil" — namun
    `evalFile`/`stepFile` berasal dari draf lain (#67) yang **belum di-merge**. Draf ini
    juga jujur menyatakan: gate hanya membatasi pihak yang memeriksanya; bukan penjaga
    penandatanganan.
  - *Agent Passports for Container Services*
    ([PR #83](https://github.com/TapeOutProtocol/TAPs/pull/83)): mengikat satu identitas
    ERC-8004 ke satu sirkuit TapeOut yang container-nya meng-host layanan agen; paspor
    berlaku bila satu wallet memiliki kedua token. Konsepnya sejalan dengan "Safe Agent
    Passport" Xaverus, tapi masih draf dan merujuk registry ERC-8004 di BNB Chain.

---

## 4. Testnet, pengujian, biaya, dan kebutuhan akun

### Testnet TapeOut: tidak ditemukan

- **Tidak ditemukan testnet TapeOut, faucet, atau deployment protokol di jaringan uji
  mana pun.** Semua dokumentasi dan contoh merujuk mainnet: BNB Chain (56), X Layer (196),
  Base (8453). Bahkan "fase uji" TapeRelay berjalan di X Layer **mainnet** (mode uji,
  bukan testnet).
- X Layer sendiri **punya** testnet (chain 1952, RPC `https://testrpc.xlayer.tech/terigon`,
  faucet di `web3.okx.com/xlayer/faucet`, explorer testnet) — tapi tidak ada bukti kontrak
  factory TapeOut ter-deploy di sana. Testnet X Layer tetap berguna untuk menguji kontrak
  Xaverus sendiri, bukan integrasi TapeOut.
  Sumber: [dokumen X Layer — Network information](https://web3.okx.com/ua/xlayer/docs/developer/build-on-xlayer/network-information),
  [Chainstack — X Layer tooling](https://docs.chainstack.com/docs/xlayer-tooling).

### Cara menguji tanpa mainnet (yang tersedia)

1. **Simulasi lokal gratis:** Canvas di tapeout.net (simulasi di browser, tanpa biaya);
   Yosys + simulator netlist lokal untuk menguji semua input sebelum tape-out; evaluator
   referensi TAP-02 (disebut di draf Policy Circuit Gate) untuk verifikasi off-chain.
2. **Tes read-only mainnet gratis:** `cast call` ke `eval()` dan `fileInfo()` tidak butuh
   wallet dan tidak dipungut biaya. TapeKit menyediakan `npm run test:mainnet`
   (read-only, tanpa kunci).
3. **Fork lokal mainnet:** Foundry `anvil --fork-url https://rpc.xlayer.tech` memungkinkan
   pengujian pemanggilan `eval()` antar-kontrak tanpa transaksi sungguhan. (Praktik Foundry
   umum; bukan petunjuk resmi TapeOut.)
4. **Mainnet dengan sirkuit sangat kecil:** biaya tape-out sirkuit kecil sangat rendah
   (lihat bawah) — ini kemungkinan jalur pengujian nyata yang paling murah.

### Biaya (semua dari sumber; harga token berubah-ubah)

| Item | Biaya tercatat | Sumber |
| --- | --- | --- |
| Tape-out sirkuit 3.829 gerbang (DOT32_T, prosesor #245, X Layer, 5 Okt 2026) | Fee protokol 0,0013 OKB; biaya bersih total ~0,0023 OKB (termasuk gas); pembelian transistor 0,38356 OKB (bisa ditarik kembali karena prosesor milik sendiri) | [21 NAND docs — Build a small circuit](https://nand.aihashrate.stream/en/build/) |
| Buka container (X Layer) | 0,08 OKB (data 25 Sep 2026) | [TapeOut Complete Beginner's Guide v1.5](https://tapeoutdaily.ai/downloads/tapeout-complete-beginners-guide-v1.5-en.pdf) |
| Buat prosesor (BNB Chain) | 0,001 BNB (tercantum resmi, data 25 Sep 2026) | Panduan yang sama |
| Aktivasi nama `.tape` | 0,08 BNB / 30 hari, 1–120 bulan sekali transaksi, tidak refundable (harga BNB Chain; harga X Layer belum terkonfirmasi) | [TapeKit README §8](https://github.com/TapeOutProtocol/TapeKit) |
| Publikasi file DeWEB | ~200 gas per byte kode chunk + overhead; sebanding dengan ukuran byte | [TapeKit README §3](https://github.com/TapeOutProtocol/TapeKit) |
| Menjalankan sirkuit (read-only) | Gratis | Whitepaper §5 |

**Kebutuhan akun/kunci:** hanya wallet EVM (OKX Wallet / MetaMask) berisi sedikit OKB
X Layer untuk gas dan fee. Tidak ada pendaftaran akun, API key, atau KYC untuk memakai
protokol TapeOut. (TapeCode memakai kredit komputasi berbayar untuk fitur AI-nya; TapeKit
read-only tidak butuh apa-apa.)

---

## 5. SDK, CLI, contoh, dan template starter resmi

| Tool | Status | Tautan / cara pakai |
| --- | --- | --- |
| **TapeKit kernel** `@tapekit/kernel` | Repo resmi, MIT. Belum di npm — import dari repo. Tes unit offline + tes mainnet read-only. | [github.com/TapeOutProtocol/TapeKit](https://github.com/TapeOutProtocol/TapeKit) — `npm install && npm test`; `npm run dev:gateway` untuk gateway lokal |
| **Spesifikasi `tape://` v0.2** (`SPEC.md`) | Normatif (Inggris), CC0. Mencakup format URL, resolusi, verifikasi, dan **antarmuka kontrak di Appendix B** (factory, opener, processor, container, SiteRegistry, DomainBinding). | [SPEC.md](https://github.com/tapeoutprotocol/tapekit/blob/HEAD/SPEC.md) |
| **TapeKit sw-gateway / extension / viewer** | Implementasi referensi di repo yang sama. | Repo TapeKit |
| **TapeSend** (`@tapekit/send`, kontrak DeWebHub Foundry) | Di repo TapeKit (`send/`). Kontrak: unit + fuzz + invariant + fork test. Belum diaudit independen. | Repo TapeKit, `send/README.md` |
| **TapeAPI SDK** `@tapeapi/sdk` (komunitas) | v3.0.0 (6 Nov 2026). Belum di npm — instal dari tarball rilis GitHub atau clone repo. Termasuk `tapeapi-doctor` (diagnostik) dan `tapeapi connect`. | [github.com/BruceLanLan/tapeapi](https://github.com/brucelanlan/tapeapi) |
| **tapemule** (CLI verifikasi, komunitas) | **Repo belum publik** saat dokumen 21 NAND ditulis — perintahnya didokumentasikan tapi belum bisa dipakai. | [21 NAND docs — Check it yourself](https://nand.aihashrate.stream/en/start/verify.html) |
| **Publishing CLI TapeKit** | **Masih roadmap** ("open-source publishing CLI is on the roadmap; until then use the console or your own script"). | [TapeKit README §3](https://github.com/TapeOutProtocol/TapeKit) |
| **Template starter resmi** | **Tidak ditemukan.** Tidak ada template/starter kit resmi TapeOut (mis. `create-tapeout-app`) di sumber yang diriset. | — |
| **Contoh sirkuit nyata** | Sirkuit #279 (21 gerbang, BNB), DOT32_T 3.829 gerbang (X Layer, prosesor #245), sirkuit konsensus XBOT 3.2.268 (X Layer), CPU Behemoth 4-bit. | [21 NAND docs](https://nand.aihashrate.stream/en/), [xbotprocessor.com](https://www.xbotprocessor.com/) |
| **Yosys** (sintesis Verilog → NAND) | Tool open-source umum, bukan milik TapeOut. Disebut sebagai jalur standar membuat netlist. | — |

**Catatan penting:** tidak ada SDK resmi untuk *membuat/men-tape-out sirkuit secara
programatis* yang ditemukan — alur tape-out yang didokumentasikan adalah lewat situs
tapeout.net (Canvas + wallet) atau lewat pemanggilan kontrak langsung (ABI di SPEC
Appendix B). Tim harus siap menulis skrip Foundry/cast sendiri untuk pemanggilan kontrak
bila ingin otomatisasi, dan memvalidasi ABI terhadap kontrak yang sebenarnya.

---

## 6. Penilaian realistis untuk "human-proof minting" Xaverus

### Batasan mendasar yang harus diterima

1. **Sirkuit tidak bisa memverifikasi manusia.** Sirkuit TapeOut adalah logika kombinasional
   (+ LATCH untuk state) yang dihitung dari bit input. Ia tidak bisa memanggil API X.com,
   tidak bisa memeriksa OAuth, tidak bisa mengontak OKX, tidak punya oracle. Verifikasi
   "manusia sungguhan" selalu terjadi off-chain (server Xaverus memverifikasi OAuth X dan
   menerima klaim UID OKX bertanda tangan); yang bisa dilakukan TapeOut hanyalah
   (a) menegakkan aturan kebijakan secara transparan atas hasil verifikasi itu, dan
   (b) menjangkarkan bukti hasil verifikasi agar bisa diperiksa siapa saja.
2. **Klaim UID OKX tetap klaim bertanda tangan, bukan verifikasi OKX** — tidak ada mekanisme
   TapeOut yang mengubah status ini. Jangan biarkan integrasi TapeOut dipakai untuk
   mengesankan seolah-olah OKX sudah memverifikasi.
3. **Ukuran sirkuit terbatas** (~5.700 gerbang per transaksi di BNB; angka X Layer belum
   diketahui). Verifikasi tanda tangan kriptografi di dalam gerbang NAND tidak realistis
   dalam anggaran ini.

### Opsi-opsi

#### Opsi A — Penjangkaran bukti verifikasi di container DeWEB (DIREKOMENDASIKAN, inti)

- **Cara:** tape out satu sirkuit (bisa sirkuit kecil apa pun — bahkan yang fungsinya
  dipakai Opsi B), buka container-nya, lalu tulis file JSON bukti per mint
  (mis. `proofs/<wallet>.json`: hash handle X, hash UID OKX, tanda tangan dompet atas klaim,
  stempel waktu, alamat container) ke SiteRegistry X Layer. Frontend/kontrak Xaverus membaca
  dan memverifikasi hash-nya lewat TapeKit kernel atau `cast call fileInfo`.
- **Kenapa realistis:** semua primitifnya terdokumentasi resmi (putFile/appendChunk,
  fileInfo, verifikasi SHA-256). Tidak butuh desain sirkuit yang rumit. Biaya kecil
  (file JSON kecil = sedikit chunk). Memenuhi syarat lomba lewat "data onchain TapeOut".
- **Trade-off:** bukti disimpan on-chain secara publik — hanya hash dan tanda tangan yang
  boleh disimpan, jangan pernah data pribadi mentah (handle X dan UID OKX disimpan sebagai
  hash). Penulisan bukti butuh transaksi (gas) per mint atau per batch — desain perlu
  memutuskan siapa yang membayar (server Xaverus vs pengguna). Ini adalah "penjangkaran",
  bukan "pembuktian": nilai jujurnya adalah transparansi dan auditabilitas, bukan jaminan
  kemanusiaan.

#### Opsi B — Sirkuit kebijakan kecil untuk cek kelayakan mint (DIREKOMENDASIKAN, pelengkap A)

- **Cara:** desain sirkuit NAND kecil yang inputnya adalah bit-bit hasil verifikasi
  (mis. bit 0 = X terverifikasi, bit 1 = klaim UID ditandatangani, bit 2–9 = hitungan mint
  hari ini vs batas) dan outputnya satu bit IZINKAN/TOLAK. Tape out di prosesor X Layer
  (sendiri atau publik). Alur mint Xaverus memanggil `eval()` read-only dan mencatat
  Circuit ID + hasil evaluasi; opsional: kontrak mint memanggil `eval()` on-chain setelah
  ABI terkonfirmasi.
- **Kenapa realistis:** sirkuit puluhan–ratusan gerbang sangat mungkin dalam 2 minggu
  (contoh terdokumentasi: adder 8-bit ~70 gerbang; sirkuit 21 gerbang sudah live).
  Yosys + Verilog adalah alur standar. Biaya tape-out kecil.
- **Trade-off:** nilai sirkuit ini adalah *keterbukaan aturan* (aturan kelayakan bisa
  dibaca dan dijalankan siapa saja), bukan keamanan tambahan yang kuat — karena input
  bit-nya disiapkan off-chain oleh server Xaverus, pihak yang tidak percaya server tetap
  harus percaya input. Jujur saja dalam submission: sirkuit menegakkan kebijakan secara
  transparan; verifikasi identitas tetap off-chain. Selain itu, pemanggilan `eval()` dari
  dalam kontrak mint perlu validasi ABI dulu (belum ada contoh resmi); bila ragu, panggil
  dari backend dan catat hasilnya on-chain di kontrak Xaverus sendiri.

#### Opsi C — Cermin DeWEB statis (OPSIONAL, pelengkap)

- **Cara:** build ekspor statis halaman penjelasan/pemeriksa paspor, publikasikan ke
  container sirkuit, aktifkan nama `.tape`, optionally ikat domain.
- **Kenapa realistis tapi terbatas:** alur publikasi terdokumentasi lengkap. Tapi aplikasi
  Next.js Xaverus tidak bisa "pindah" ke DeWEB begitu saja (tanpa SSR/API route; semua
  fetch off-chain membuat lencana "100% on-chain" hilang; file maks 8,4 MB per file).
  Nilai submission-nya: memenuhi jalur alternatif syarat lomba ("run on X Layer DeWEB")
  dan memberi juri URL `tape://` yang bisa dibuka.
- **Trade-off:** usaha sedang (ekspor statis + skrip publikasi + biaya per byte + biaya
  aktivasi nama) untuk nilai tambah yang kecil dibanding A+B. Lakukan hanya bila waktu
  tersisa.

#### Opsi D — Verifikasi identitas di dalam sirkuit (TIDAK REALISTIS)

- Memverifikasi OAuth X atau UID OKX (atau memverifikasi tanda tangan ECDSA/EdDSA) murni
  dalam gerbang NAND: tidak ada akses jaringan/oracle, anggaran gerbang per transaksi
  hanya ribuan, dan tidak ada satu pun contoh atau spesifikasi resmi yang menunjukkan
  ini mungkin. **Jangan dijanjikan.**
- Mengandalkan draf TAP (Policy Circuit Gate / Agent Passports) sebagai standar jadi:
  keduanya belum di-merge; fungsi `evalFile`/`stepFile` belum terkonfirmasi ter-deploy;
  TAPI-25 (circuit-verified methods) secara eksplisit berstatus "Not implemented".
  Boleh dikutip sebagai inspirasi desain, tidak boleh diklaim sebagai integrasi yang
  dipakai.

### Rekomendasi akhir

**Kerjakan A + B sebagai satu paket** ("Xaverus Human-Proof Minting, anchored on TapeOut"):
satu sirkuit kebijakan kecil + container yang menyimpan bukti hash per mint. Ini memberi
submission: satu Circuit ID + alamat kontrak prosesor (wajib untuk proyek sirkuit), data
onchain yang bisa diverifikasi juri lewat `cast`/TapeKit, dan cerita produk yang jujur:
verifikasi manusia dilakukan off-chain dengan standar yang jelas, aturannya ditegakkan
sirkuit terbuka, buktinya dijangkarkan on-chain. Tambahkan C hanya bila waktu tersisa.

---

## 7. Yang WAJIB disediakan saat submission (terkait TapeOut)

Dari halaman resmi lomba
([web3.okx.com/xlayer/build-x-series](https://web3.okx.com/xlayer/build-x-series)):

1. **Syarat inti:** proyek membangun di dalam ekosistem TapeOut dan **memakai sirkuit,
   kontrak, atau data onchain TapeOut di X Layer, ATAU berjalan di X Layer DeWEB.**
2. **Proyek sirkuit wajib menyerahkan: alamat kontrak prosesor dan Circuit ID.**
3. **Website, aplikasi, dan tool wajib menyediakan: tautan akses + penjelasan proyek/fitur
   ekosistem TapeOut mana yang dipakai.**
4. **Deskripsi proyek wajib menjelaskan:** produk/layanan, target pengguna dan cara
   menjangkau mereka, model pendapatan yang diusulkan, dan mengapa pengguna mau membayar
   dan terus memakai. (Proyek sirkuit/tool/mekanisme boleh menjelaskan kasus penggunaan
   dan aplikasi komersial yang didukung.)
5. **Proyek yang sudah ada (seperti Xaverus) wajib** menyertakan pengembangan baru yang
   substansial selama acara dan menjelaskan apa yang ditambahkan — **hanya pekerjaan baru
   selama acara yang dinilai.**
6. **FAQ resmi yang meringankan:**
   - Antarmuka, komputasi, dan fitur lain **boleh berjalan di luar sirkuit** — jelaskan
     fitur mana yang memakai TapeOut di deskripsi proyek.
   - **Boleh memakai prosesor, sirkuit, dan tool developer TapeOut yang sudah ada** (tidak
     wajib membuat prosesor sendiri).
   - Proyek yang belum menghasilkan pendapatan boleh ikut.
   - Antarmuka dan komponen lain **tidak wajib di-deploy on-chain**.
7. **Video demo:** direkomendasikan ≤ 3 menit, mencakup masalah, demo fitur inti, target
   pengguna dan model bisnis, dan cara proyek memakai TapeOut / tool ekosistem terkait.
8. **Tenggat:** 7 Desember 2026 pukul 23.59 UTC (provisional; halaman resmi yang
   memutuskan tanggal final). Kirim lewat formulir submission di halaman resmi.
9. **Kriteria penilaian:** nilai pengguna & potensi komersial; inovasi; integrasi ekosistem
   (penggunaan DeWEB, FabX, TapeCode, TapeKit, TapeSend yang efektif — "penggunaan proyek
   atau tool tertentu tidak diwajibkan"); kesiapan produk & UX; video demo.
10. **Lain-lain:** hadiah dibayar bertahap berdasarkan milestone yang disepakati setelah
    acara; pemenang wajib menyediakan wallet self-custodial; peserta mempertahankan IP;
    tim yang lolos seleksi menghadiri Demo Day offline.

**Checklist artefak TapeOut untuk submission Xaverus (dari riset ini):**

- [ ] Alamat kontrak prosesor (X Layer) tempat sirkuit kebijakan di-tape-out
- [ ] Circuit ID sirkuit kebijakan (+ nama `.tape`, mis. `<id>.2.<prosesor>.tape`)
- [ ] Alamat container sirkuit
- [ ] Transaksi / bukti penulisan file bukti ke SiteRegistry (atau tautan explorer)
- [ ] Tautan akses aplikasi + penjelasan fitur TapeOut yang dipakai (Opsi A+B)
- [ ] Deskripsi "apa yang baru selama acara" (human-proof minting + integrasi TapeOut)
- [ ] Video demo ≤ 3 menit yang menunjukkan pemanggilan `eval()` / verifikasi bukti

---

## 8. Ketidakpastian dan yang belum terverifikasi

Hal-hal di bawah ini **tidak berhasil dikonfirmasi** dari sumber yang dibaca; jangan
jadikan asumsi dalam spec tanpa verifikasi lanjutan (cek on-chain / tanya di kanal
Telegram dukungan lomba):

1. **Batas gas per transaksi tape-out di X Layer** (angka ~5.700 gerbang hanya diketahui
   untuk BNB Chain). Mempengaruhi ukuran maksimum sirkuit kebijakan.
2. **ABI kanonis `eval()` untuk pemanggilan antar-kontrak** di X Layer. Pola
   `eval(uint256,bytes)(bytes)` terdokumentasi lewat contoh `cast` (read-only, off-chain);
   pemakaian dari dalam kontrak Solidity belum ada contoh resminya.
3. **Harga aktivasi nama `.tape` di X Layer** (yang tercantum di TapeKit README hanya harga
   BNB: 0,08 BNB/30 hari) dan harga buka container terkini di X Layer (angka 0,08 OKB
   berasal dari panduan September 2026).
4. **URL situs / dokumentasi resmi TapeCode.** Tidak ditemukan lewat pencarian; hanya
   deskripsi di laporan mingguan dan post X.
5. **Apakah factory TapeOut ter-deploy di X Layer testnet (1952).** Tidak ditemukan bukti
   apa pun — asumsikan tidak ada sampai terbukti sebaliknya.
6. **Alamat kontrak di §1** disalin dari dokumen (TapeKit README, 21 NAND docs) —
   keberadaannya sudah diverifikasi 19 Nov 2026 lewat `cast code` (semua mengembalikan
   bytecode, lihat catatan di §1), tapi perilaku/ABI masing-masing belum diverifikasi.
   Wajib validasi sebelum dipakai.
7. **Status draf TAP** (Policy Circuit Gate, Agent Passports, #67 netlist-bound NFT)
   per 24 Oktober 2026 masih draf/PR belum di-merge; status per November 2026 belum dicek
   ulang satu per satu.
8. **TapeRelay** masih fase uji (~2 minggu sejak 18 November 2026); detailnya bisa berubah
   cepat dan tidak relevan untuk jalur utama rekomendasi.
9. **Biaya-biaya di §4** berasal dari contoh September–Oktober 2026 dan harga token yang
   berubah; lakukan tape-out percobaan kecil dulu untuk mengukur biaya sebenarnya.
10. **Ekosistem berusia ~3 bulan** (diluncurkan Agustus 2026): dokumentasi, tool, dan
    kontrak berubah cepat; periksa ulang halaman lomba dan repo resmi menjelang submission.

---

## Daftar sumber

**Primer (resmi TapeOut / X Layer / OKX):**

- Situs resmi TapeOut — https://tapeout.net/
- Whitepaper TapeOut (manifesto, Mandarin) — https://tapeout.net/TapeOut-Protocol.pdf
- GitHub TapeOutProtocol (org) — https://github.com/TapeOutProtocol
- TapeKit (repo, README, SPEC.md) — https://github.com/TapeOutProtocol/TapeKit
- TAPs (repo usulan standar) — https://github.com/TapeOutProtocol/TAPs
- Halaman lomba X Layer TapeOut Accelerate — https://web3.okx.com/xlayer/build-x-series
- Dokumen X Layer: RPC endpoints — https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints
- Dokumen X Layer: Network information — https://web3.okx.com/ua/xlayer/docs/developer/build-on-xlayer/network-information
- FabX — https://fabx.tech/

**Sekunder / komunitas (berguna, tapi bukan sumber resmi protokol):**

- 21 NAND docs (panduan sirkuit, alamat kontrak, perintah verifikasi) — https://nand.aihashrate.stream/en/
- TapeOut Complete Beginner's Guide v1.5 (terjemahan Inggris, data 25 Sep 2026) — https://tapeoutdaily.ai/downloads/tapeout-complete-beginners-guide-v1.5-en.pdf
- TapeOut Ecosystem Weekly Report, 12–18 Okt 2026 (terjemahan) — https://teletype.in/@wessd6/tapeoutweekrep?utm_source=teletype&utm_medium=feed_atom&utm_campaign=wessd6
- TapeAPI (repo komunitas BruceLanLan; docs, TAPI-25, panduan) — https://github.com/BruceLanLan/tapeapi
- TAP-draft Policy Circuit Gate (PR #84) — https://github.com/TapeOutProtocol/TAPs/pull/84
- TAP-draft Agent Passports for Container Services (PR #83) — https://github.com/TapeOutProtocol/TAPs/pull/83
- ODaily: An In-Depth Overview of the TapeOut Ecosystem — https://www.odaily.news/en/post/5213070
- KuCoin Insight: TapeRelay Launches on X Layer — https://www.kucoin.com/news/insight/X/6afd698a9278e40007d87d41
- XBOT Processor (contoh sirkuit X Layer 3.2.268) — https://www.xbotprocessor.com/
- Bitrue: TapeOut X (TAPEOUTX) — klarifikasi token tak terkait — https://www.bitrue.com/blog/tapeout-x-tapeoutx-price-contract-address-how-to-buy
- Chainstack: X Layer tooling (faucet testnet, RPC) — https://docs.chainstack.com/docs/xlayer-tooling
