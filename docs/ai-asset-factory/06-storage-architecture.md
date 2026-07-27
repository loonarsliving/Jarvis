# Google Drive sebagai Master Visual Storage

## 1. Kenapa Google Drive, dan Kenapa Selaras dengan MK Connect

MK Connect sudah memakai Google Drive sebagai backend baru untuk Asset Library KontenAI (`01-research-mkconnect.md` §5) — service account JWT, folder dibuat idempoten per company/project/campaign. AI Asset Factory memakai Google Drive sebagai **master storage utamanya**, dengan struktur yang **selaras** (compatible), bukan bertentangan — sehingga saat MK Connect Content AI matang, ia bisa membaca langsung aset premium yang diproduksi AI Asset Factory tanpa migrasi data.

## 2. Hierarki Folder

```
/AI Asset Factory
  /_DNA                          <- Master reference, read-only setelah approve
    /products
      /{product-slug}/v{n}/      <- turnaround sheet, reference photos, DNA record (json)
    /characters
      /{character-slug}/v{n}/    <- turnaround sheet, reference photos, DNA record (json)
  /{company}                     <- selaras dengan skema company/project/campaign KontenAI
    /{project}
      /{campaign}
        /raw                     <- output generation mentah, belum lolos QC
        /approved                <- lolos QC + review manusia, status "usable"
        /rejected                <- gagal QC, disimpan untuk audit/analisis (bukan dihapus)
  /_templates                    <- (opsional) render referensi prompt-template, bukan aset produksi
```

Prinsip: `_DNA` terpisah tegas dari folder campaign — karena DNA record adalah aset lintas-campaign (satu karakter/produk dipakai di banyak campaign), bukan aset campaign itu sendiri.

## 3. Naming Convention

Pola: `{company}_{project}_{campaign}_{assetType}_{shortDesc}_{version}_{status}.ext`

Contoh: `mkh_villaX_launch2026_hero_productA_v2_approved.mp4`

Untuk file DNA record: `{slug}_dna_v{n}.json`, disandingkan dengan file media referensi bernama konsisten (`{slug}_turnaround_v{n}.jpg`).

Rasional: mengikuti pola industri (Pixar/DAM — `01-research-mkconnect.md`/`02-research-market.md` §1) di mana nama file sendiri harus cukup untuk mengenali project, tipe, versi, status tanpa perlu membuka file — sebagai lapisan kedua di luar metadata terstruktur (bukan pengganti metadata).

## 4. Metadata & Provenance (Lapisan Utama, Bukan Hanya Nama File)

Setiap aset punya companion metadata (disimpan sebagai file `.json` di sebelah aset, dan/atau di database index — lihat `07-system-architecture.md` §3):

- `asset_id` (UUID internal)
- `asset_type`, `company`, `project`, `campaign`, `platform`, `status` — selaras skema kolom `kontenai_assets` MK Connect agar mapping/impor mudah
- `product_dna_ref` / `character_dna_ref` + versi yang dipakai
- `template_id` + versi (dari Prompt Engine)
- `prompt_final` (teks prompt persis yang dipakai — bukan cuma ringkasan)
- `generation_model` + versi
- `seed` (jika berlaku)
- `qc_report` (skor per dimensi, lihat `05-quality-control.md`)
- `reviewed_by`, `reviewed_at` (jika lewat review manusia)
- `tags[]` (untuk pencarian, mengikuti controlled vocabulary — lihat §5)
- `created_at`, `superseded_by` (jika ada versi lebih baru menggantikan)

## 5. Tagging & Controlled Vocabulary

Mengikuti praktik DAM (`02-research-market.md` §1): tag TIDAK bebas-teks tanpa kontrol. Ada daftar tag terkurasi (controlled vocabulary) per dimensi — mis. daftar baku `mood`, `shot_type`, `platform`, `content_type` — untuk mencegah fragmentasi pencarian (`"SF"` vs `"San Francisco"` vs `"San Fran"`). Daftar ini dikelola sebagai data (bisa tumbuh), bukan hardcode.

## 6. Versioning

- Produk/karakter: versi DNA record naik saat identitas berubah resmi (rebranding, dsb) — lihat `03-consistency-framework.md` §2. Versi lama tidak dihapus.
- Aset hasil generation: tidak "di-edit in place". Jika suatu aset perlu revisi, itu jadi aset baru dengan `superseded_by`/`supersedes` saling merujuk — menjaga audit trail penuh (meniru model variant Pixar/USD di `02-research-market.md` §1, disederhanakan untuk kebutuhan kita: bukan multi-departemen real-time, cukup linear history).

## 7. Thumbnail & Preview

Setiap aset video/gambar besar punya thumbnail kecil di-generate otomatis saat approve (dipakai untuk index pencarian cepat & preview UI) — disimpan berdampingan (`{namafile}_thumb.jpg`), tidak menggantikan file asli.

## 8. Skalabilitas Jangka Panjang

- Folder per company/project/campaign membatasi ukuran satu folder tunggal tidak membengkak tanpa batas (masalah umum kalau semua file ditumpuk rata).
- Index pencarian sesungguhnya (full-text + tag + embedding semantik — lihat `07-system-architecture.md`) **tidak boleh bergantung pada file-system traversal Google Drive** untuk pencarian sehari-hari — Drive adalah tempat penyimpanan fisik, bukan mesin pencari. Database index yang menyalin metadata (bukan file besar) adalah lapisan yang sesungguhnya dipakai untuk query.
- Kuota: karena akun layanan (service account) tidak punya kuota sendiri, semua penyimpanan berjalan di atas Shared Drive milik perusahaan (pola sudah dipakai KontenAI) — pantau kuota sebagai bagian operasional rutin.
