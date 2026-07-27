# Framework Konsistensi: Product Lock & Character Lock

Ini adalah prioritas tertinggi AI Asset Factory. Tujuan: aset yang dihasilkan hari ke-1 dan aset yang dihasilkan hari ke-500 untuk produk/karakter yang sama harus **tidak bisa dibedakan** dari segi identitas — hanya scene, pose, lighting, komposisi yang boleh berbeda.

## 1. Konsep Inti: "DNA" sebagai Entitas Data, Bukan Sekadar Gambar

Berdasarkan riset (`02-research-market.md` §3–4), identitas tidak boleh disimpan hanya sebagai "satu file referensi" — ia harus jadi **record terstruktur** yang menjadi single source of truth, dipakai berulang oleh mesin prompt maupun mesin generation.

### 1.1 Product DNA (record)
Field wajib per produk:
- Identitas: nama produk, SKU/kode internal, brand
- Geometri: bentuk, proporsi/dimensi, material
- Visual lock: warna eksak (HEX/Pantone), tipografi label, posisi & ukuran logo, elemen kemasan yang tidak boleh berubah
- Referensi kanonik: 1 set foto studio resolusi tinggi (flat-lay/ghost-mannequin) sebagai "source of truth" — bukan foto marketing biasa
- Negative constraints: daftar eksplisit hal yang tidak boleh muncul (logo salah, proporsi berubah, teks tambahan, warna melenceng)
- Versi: Product DNA punya version history (produk bisa rebranding/ganti kemasan — versi lama tidak dihapus, hanya di-supersede)

### 1.2 Character DNA (record)
Field wajib per karakter:
- Identitas: nama karakter (internal), peran (brand ambassador/model UGC/dst)
- Wajah: karakteristik terdeskripsi + reference set wajah dari beberapa sudut
- Tubuh: proporsi, tinggi relatif, tipe tubuh
- Rambut: warna, gaya, panjang — dicatat eksplisit karena paling gampang drift
- Outfit default & varian outfit yang diizinkan
- Ekspresi & pose "signature" yang jadi baseline
- Character turnaround sheet: grid multi-sudut (depan/samping/tiga-perempat/belakang) — **wajib dibuat & disetujui manusia sebelum karakter dipakai produksi massal**
- Reference set untuk teknik lock (lihat §3): foto sumber untuk IP-Adapter/InstantID, atau dataset training untuk LoRA
- Negative constraints: hal yang tidak boleh berubah (warna mata, bentuk wajah, dst.)
- Versi: sama seperti Product DNA

## 2. Alur Onboarding Identitas (Wajib, Bukan Opsional)

```
1. Intake      : Upload foto/referensi awal produk atau karakter
2. Sheet Gen   : Generate turnaround sheet (produk: multi-angle studio; karakter: multi-angle wajah/tubuh)
3. Human Review: Reviewer menyetujui sheet sebagai kanonik — TIDAK ADA produksi massal tanpa approval ini
4. DNA Record  : Sheet + metadata terstruktur dikunci sebagai Product DNA / Character DNA versi 1
5. Lock Asset  : DNA record disimpan sebagai "master reference" bertipe khusus di storage (lihat 06-storage-architecture.md), read-only setelah approve
6. Ready       : DNA record siap dipakai Prompt Engine (04-prompt-engine.md) untuk semua generation berikutnya
```

Perubahan pada produk/karakter (mis. rebranding) **selalu bikin versi baru**, tidak pernah menimpa versi lama — karena aset lama yang sudah diproduksi masih perlu merujuk DNA yang berlaku saat itu (traceability).

## 3. Stack Teknik (Berlapis, Bukan Satu Teknik Tunggal)

Berdasarkan riset, tidak ada satu teknik yang menutup semua axis konsistensi sekaligus. Pendekatan yang benar adalah **stacking**:

| Axis | Teknik utama | Cadangan/pelengkap |
|---|---|---|
| Wajah/identitas karakter | LoRA per-karakter (fidelity tertinggi, reusable) | InstantID/PhotoMaker (cepat, tanpa training, untuk karakter baru yang belum sempat dilatih) |
| Pose/komposisi/struktur | ControlNet (pose/depth) | Structure Reference (bila model target menyediakan) |
| Look produk/brand | Style Reference + Product DNA record | Reference-image conditioning berbobot (mis. `--sref` + weight) |
| Identitas produk eksak (logo/warna/kemasan) | Reference-image kanonik + negative prompt eksplisit | QC gate otomatis (lihat `05-quality-control.md`) sebagai jaring pengaman, bukan pencegahan |
| Konsistensi lintas banyak scene/durasi panjang | Continuous reference-checking sepanjang generation (bukan hanya anchor frame pertama) — dipilih model generation yang mendukung ini bila tersedia | Verbatim repeated text description sebagai fallback pada model text-only |

**Prinsip pemilihan teknik**: karakter/produk yang dipakai jangka panjang & volume tinggi → investasi LoRA training di awal (biaya training dibayar oleh reuse ribuan generation). Karakter/produk uji-coba atau volume rendah → cukup reference-conditioning (InstantID/PhotoMaker/Structure+Style Reference), tanpa training, cepat dipakai.

## 4. Aturan Wajib (Hard Rules)

Sesuai brief awal — tidak boleh pernah terjadi pada aset yang lolos ke status "usable":
- Logo berbeda dari Product DNA
- Tipografi berbeda dari Product DNA
- Kemasan berbeda dari Product DNA
- Warna di luar toleransi yang ditetapkan (lihat QC scoring, `05-quality-control.md`)
- Dimensi/proporsi produk menyimpang
- Branding yang tidak sesuai brand kit

Semua aturan ini **dicek otomatis** oleh QC Gate sebelum status aset bisa naik ke "approved/usable" — lihat `05-quality-control.md` §2 (Product Fidelity Check) dan §3 (Character Fidelity Check).

## 5. Prompt Chaining untuk Konsistensi

Setiap prompt generation yang melibatkan DNA record mengikuti struktur baku (detail penuh di `04-prompt-engine.md`):

```
[IDENTITY HEADER — restated tiap generation]
  - Ringkasan Product DNA / Character DNA relevan (bukan seluruh record, hanya field kunci)
[REFERENCE BINDING]
  - product_ref -> file kanonik X
  - character_ref -> file kanonik Y
  - style_ref -> (opsional, brand mood board)
[SCENE INSTRUCTION — bagian yang divariasikan]
  - Deskripsi scene/camera/lighting dari Storyboard/Brief
[NEGATIVE CONSTRAINTS]
  - Daftar exclusion dari DNA record
[SUCCESS CRITERIA]
  - Kriteria yang dipakai QC Gate untuk skor otomatis
```

Prinsipnya: identitas SELALU dinyatakan ulang eksplisit setiap generation (tidak pernah diasumsikan model "ingat" dari generation sebelumnya), sementara hanya bagian scene yang divariasikan secara sengaja oleh Prompt Engine.
