# Riset Pasar: Platform Kompetitor & Studio Besar

Riset ini dilakukan via pencarian web (bukan uji langsung ke platform). Klaim vendor ditandai sebagai klaim, bukan fakta terverifikasi independen.

## 1. Platform Generative Video/Image

| Platform | Kekuatan utama | Mekanisme konsistensi | Kelemahan/gap |
|---|---|---|---|
| **Higgsfield** | Agregator banyak model di satu credit system; kontrol kamera/lensa (Cinema Studio 3.0) | "Soul ID" — training dari 20+ foto referensi persona; hingga 3 karakter konsisten dalam 1 scene | Mekanisme teknis Soul ID tidak diungkap publik |
| **Runway (Gen-4/4.5)** | Dinilai terbaik di kelasnya untuk konsistensi karakter lintas scene dari 1 referensi | "References": hingga 3 gambar referensi, diberi label eksplisit (`image_1`, dst) yang diikat ke peran tertentu dalam prompt | Resolusi referensi dibatasi; sangat sensitif ke kualitas foto referensi (harus tajam, frontal) |
| **Pika** | Efek fisika/transformasi siap pakai ("Pikaffects"), cepat untuk konten pendek | Tidak ditemukan sistem referensi identitas yang terdokumentasi jelas | Gap terdokumentasi soal character-identity consistency |
| **Google Veo (3/3.1)** | Panduan prompting resmi paling matang (enterprise-grade) | "Reference to Video": hingga 3 gambar berlabel peran (karakter/produk/environment); image-to-video adalah mode paling stabil untuk konsistensi | Tidak bisa gabung frame pertama/terakhir DAN multi-reference dalam satu request |
| **Seedance (ByteDance)** | Klaim continuous reference-checking (bukan cuma anchor di frame pertama) — pendekatan lebih canggih dari yang lain | Sistem multi-referensi hingga 50 input + `@tagging` untuk mengikat aset ke token prompt tertentu | Klaim detail (2.5) mayoritas dari blog sekunder, bukan paper primer |
| **Kling AI** | Toolchain konsistensi paling lengkap & bernama jelas di antara video generator murni | "Element Binding" (referensi video, bukan cuma foto), "Subject Library", "Character ID", "AI Multi-Shot", "Omni tagging" | Terminologi berubah cepat antar versi — fitur masih berkembang |
| **Luma AI (Dream Machine)** | Panduan resmi menggabungkan Character Reference + Keyframes untuk kontinuitas antar-shot | `@character` tag + rekomendasi resmi bikin "character sheet" (4 sudut pandang) sebelum generate | Konsistensi lintas scene sangat berbeda belum dibenchmark independen |
| **Captions AI** | Bagus untuk UGC otentik karena mulai dari rekaman asli manusia, bukan sintesis penuh | Tidak relevan — bukan generator karakter dari nol | Kurang cocok untuk kebutuhan karakter sintetis skala besar |
| **Creatify** | Alur ads batch skala besar dari URL produk (100+ video/batch) | "Aurora" avatar model — klaim identitas stabil lintas video multi-menit; workflow upload brand guide + produk + ads pemenang sebagai referensi | Klaim non-drift belum diverifikasi independen |
| **Arcads** | Aktor berbasis mocap manusia asli (lisensi), gerakan lebih natural | Identitas melekat (bukan digenerate) — bukan solusi untuk karakter baru/branded | Tidak generalisasi ke karakter kustom |
| **HeyGen** | Tooling API/developer paling matang (async + webhook) di antara platform avatar | "Avatar V" diklaim tanpa drift hingga 10 menit (bukti tidak langsung bahwa drift adalah masalah industri yang dikenal) | Klaim performa (99% lip-sync) tanpa metodologi terbuka |
| **Opus Clip** | Repurposing long-form → short-form, scoring virality, API publik | N/A (bukan generator) | Bergantung sepenuhnya pada kualitas footage sumber |
| **CapCut AI** | Integrasi generate+edit+template dalam satu tool, didukung model Seed-family ByteDance | Mewarisi karakteristik Seedance | Tooling enterprise/API lebih terbatas dibanding HeyGen/Runway |
| **Adobe Firefly** | Paling "enterprise/legal-conscious": Content Credentials (C2PA provenance), commercially-safe training data | **Structure Reference** (kunci layout/komposisi/sudut kamera) terpisah dari **Style Reference** (kunci look/lighting/warna) — kombinasi keduanya jadi cara keluar dari "slot machine" hasil acak | Penekanan lebih ke konsistensi brand/style, bukan identitas karakter spesifik |

## 2. DAM Enterprise & Creative Ops

- **Bynder**: auto-tagging AI saat upload, version control eksplisit, modul terpisah "Asset Workflow" untuk brief→proofing→approval dengan metaproperty custom per campaign.
- **Frontify**: DAM yang menyatukan aset + brand guideline + workflow dalam satu sistem (bukan storage-first murni); approval mendukung comment timestamped di video, permission granular per tim/region/brand.
- **Aprimo**: gabungan DAM + Marketing Work Management; "Intelligent Content Brief" auto-generate brief kampanye untuk mempercepat siklus perencanaan dan menjaga konsistensi pesan — paling dekat dengan konsep "brief-in, asset-out lifecycle" penuh.

Catatan: **tidak satupun** DAM di atas terlihat punya field metadata bawaan untuk provenance generative AI (prompt, model/version, seed, reference asset lineage) — ini area yang harus dibangun kustom di AI Asset Factory, bukan diharapkan dari DAM generik.

## 3. Teknik Konsistensi (Literatur Teknis)

- **Reference-image conditioning** (tanpa training) — pendekatan dominan di hampir semua platform komersial: 1–3 (hingga 50 untuk Seedance 2.5) gambar/video referensi, diberi label peran eksplisit (karakter vs produk vs environment vs style) dalam prompt.
- **IP-Adapter** (termasuk varian FaceID) — adapter ringan yang menyuntik fitur gambar referensi ke model diffusion tanpa fine-tuning penuh. Cepat, tanpa training per-karakter, tapi fidelity umumnya lebih lemah dari fine-tuning.
- **ControlNet** — kondisi spasial/struktural (pose, depth, edge map) sebagai jalur kontrol paralel; menjaga komposisi/pose sambil identitas diurus mekanisme lain.
- **LoRA (Low-Rank Adaptation)** — fine-tuning ringan per-karakter (~20–50 gambar training). Disebut berulang sebagai "upgrade konsistensi terbesar" karena bertahan lebih baik lintas sudut/pose dibanding reference-conditioning saja — trade-off: perlu langkah training + compute per karakter, tapi hasilnya jadi aset durable & reusable (cocok masuk sistem versioning DAM).
- **InstantID / PhotoMaker** — identity extraction tanpa training: InstantID dari 1 foto (klaim >90% facial similarity), PhotoMaker dari 2–5 foto (lebih baik untuk gaya stilasi).
- **Character sheet / turnaround** — pola lintas-vendor: bangun satu gambar referensi berisi grid multi-sudut (depan/samping/tiga-perempat/belakang) sekali per karakter, baru dipakai sebagai referensi untuk semua generation berikutnya.
- **Seed locking** — mengunci random seed mengurangi variasi stokastik, tapi hanya mitigasi parsial.
- **Negative prompting** — mengecualikan secara eksplisit "default" model (bentuk wajah generik, warna rambut salah, dsb) — penting saat pengaruh referensi lemah.
- **Verbatim repeated text description** — Google Veo secara resmi mencatat: mengulang deskripsi teks karakter yang sama persis lintas prompt juga membantu konsistensi, sebagai pelengkap/fallback dari conditioning gambar.

## 4. Pola yang Layak Ditiru (Sintesis untuk AI Asset Factory)

1. **Role-tagged reference sebagai primitive universal.** Setiap request generation membawa referensi terstruktur per peran: `character_ref`, `product_ref`, `style_ref`, `environment_ref` — bukan daftar gambar datar. Ini konvergen di Runway, Veo, Seedance, Kling.
2. **Character/Product sheet sebagai aset pra-produksi wajib**, bukan langkah opsional — dihasilkan sekali, direview manusia, dikunci sebagai referensi kanonik bervensi.
3. **Pisahkan kontrol struktur/komposisi dari kontrol identitas/style** — mirror pola Structure Reference vs Style Reference (Adobe) dan ControlNet vs IP-Adapter/LoRA (riset).
4. **Metadata provenance sebagai lapisan governance**, bukan cuma pencarian — prompt, model/versi, reference asset ID, seed dicatat terstruktur saat aset dibuat (mengikuti semangat Content Credentials/C2PA Adobe).
5. **Gate approval brief→generate→review→approve** sebelum aset naik status "usable" — pola Bynder Asset Workflow / Aprimo Intelligent Content Brief.
6. **Arsitektur API-first + job/webhook** — desain untuk dipanggil sistem lain (MK Connect), bukan cuma dipakai interaktif lewat UI — mengikuti pola HeyGen/Opus Clip.
7. **Continuous reference-checking sepanjang generation**, bukan cuma anchor di frame pertama — pendekatan paling kuat yang ditemukan (klaim Seedance 2.5, dan kerangka "Avatar V vs IV" HeyGen soal drift) untuk mitigasi identity drift pada video panjang/banyak scene.

Level kepercayaan: dokumentasi resmi vendor (Runway, Adobe, Google Cloud, HeyGen developer docs, Bynder/Frontify docs) diperlakukan sebagai sumber primer yang cukup andal. Blog agregator "panduan 2026" diperlakukan sebagai confidence rendah (berguna untuk pola alur kerja/istilah, bukan angka performa). Paper akademik (IP-Adapter, LoRA, ControlNet) kuat secara teknis tapi tidak mesti mencerminkan implementasi internal vendor tertentu.
