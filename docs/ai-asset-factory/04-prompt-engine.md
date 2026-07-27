# Prompt Intelligence Engine

Tujuan: prompt bukan ditulis satu-satu oleh manusia, tapi **dikomposisi otomatis oleh sistem** dari komponen-komponen terstruktur, tervalidasi, dan bisa berevolusi berdasarkan hasil produksi nyata.

## 1. Kenapa Bukan "Sekadar Menulis Prompt"

Riset MK Connect (`01-research-mkconnect.md` §3.3) menunjukkan pola yang baik (prompt dibangun di satu file domain, parsing defensif) tapi prompt itu sendiri statis — tertanam di kode, tidak punya versioning, tidak punya mekanisme belajar dari hasil produksi. Riset pasar (`02-research-market.md` §4) menegaskan prompt profesional modern diperlakukan sebagai **artefak yang di-deploy**, bukan teks sekali pakai — dengan versioning ala git, testing terhadap set regresi, dan loop optimasi berbasis feedback.

## 2. Arsitektur Template

Prompt dipecah jadi komponen statis vs slot dinamis:

- **Static components** (jarang berubah, di-govern ketat):
  - Identity header (dari Product DNA / Character DNA — lihat `03-consistency-framework.md`)
  - Brand rules / brand tokens (palet warna, tone visual)
  - Negative constraint list baku
- **Dynamic slots** (sengaja divariasikan per generation):
  - Scene/environment
  - Camera angle & shot type
  - Lighting setup
  - Mood/emosi
  - Product/character yang sedang dipakai (referensi ke DNA record versi tertentu)

Pola variasi yang dipakai: **base prompt tetap + satu axis divariasikan per batch** (mis. produk & lighting tetap, background diganti 5 varian) — pola "base + controlled variation axis" yang ditemukan konsisten di riset pasar.

## 3. Template Library

Template dikelompokkan per kelas aset produksi, contoh kelas awal:
- Hero shot (produk, studio, background putih bersih)
- Lifestyle shot (produk dalam konteks penggunaan nyata)
- UGC-style (karakter memegang/menggunakan produk, gaya kasual)
- Turnaround/character sheet (khusus onboarding, lihat `03-consistency-framework.md` §2)
- Social vertical (rasio & framing untuk Reels/TikTok/Shorts)

Setiap template adalah entitas tersendiri dengan:
- Versi (semver-like: `hero-shot-v3`)
- Riwayat perubahan (siapa ubah apa kapan)
- Status: `draft` / `production` / `deprecated`
- Metrik performa terkait (skor QC rata-rata, tingkat approval manusia) — lihat §5

## 4. Prompt Versioning & Deployment Discipline

Meniru disiplin CI/CD prompt (`02-research-market.md` §4):
1. Perubahan template dibuat sebagai draft, tidak langsung dipakai produksi.
2. Draft diuji terhadap **regression set** — sekumpulan brief/DNA record referensi yang hasilnya sudah dikenal baik, untuk memastikan perubahan template tidak menurunkan skor QC dibanding versi sebelumnya.
3. Template hanya dipromosikan ke `production` jika skor QC pada regression set setara atau lebih baik dari versi aktif.
4. Template `production` lama tidak dihapus — jadi `deprecated` tapi tetap bisa dirujuk (untuk audit aset lama yang dibuat dengannya).
5. Rollback = mengaktifkan kembali versi `deprecated` sebagai `production`.

## 5. Loop Evolusi Prompt (Closed-Loop, yang Absen di KontenAI)

Ini secara sengaja menutup celah yang ditemukan di MK Connect (`01-research-mkconnect.md` §3.9 — rekomendasi optimasi yang dihasilkan AI tidak pernah dibaca kembali oleh AI Director):

```
Generation batch selesai
        v
QC Gate memberi skor (05-quality-control.md)
        v
Skor + metadata (template dipakai, DNA version, slot values) dicatat
        v
Agregasi periodik: template mana yang konsisten skor rendah / tinggi?
        v
Optimizer (agent/proses terjadwal) mengusulkan revisi template
        v
Revisi diuji ke regression set (lihat §4)
        v
Jika lebih baik -> promosikan ke production
Jika tidak -> revisi dibuang, dicatat sebagai percobaan gagal (bukan diulang tanpa alasan)
```

Sinyal feedback untuk loop ini murni dari **QC Gate otomatis milik AI Asset Factory sendiri** (skor fidelity produk/karakter, skor kualitas teknis) — bukan bergantung pada data performa publish/engagement dari MK Connect, karena publishing engine MK Connect saat ini belum menghasilkan data itu secara andal (`01-research-mkconnect.md` §3.9). Jika suatu saat MK Connect Content AI matang dan bisa mengirim balik sinyal performa nyata, itu jadi input tambahan opsional ke loop ini — bukan prasyarat.

## 6. Kontrak Antarmuka Prompt Engine

Prompt Engine menerima satu objek permintaan generation terstruktur dan mengembalikan prompt final + metadata provenance:

**Input** (konsep, bukan skema final — didetailkan saat implementasi):
- `template_id` + versi
- `product_dna_ref` dan/atau `character_dna_ref` (bisa lebih dari satu untuk multi-subjek)
- `scene_slots` (nilai untuk dynamic slots)
- `target_platform` (memengaruhi rasio/framing default)

**Output**:
- Prompt final (siap dikirim ke model generation)
- Reference bindings terstruktur (role-tagged: `character_ref`, `product_ref`, `style_ref`, `environment_ref` — pola dari `02-research-market.md` §4.1)
- Provenance record: template+versi, DNA record+versi, seed (jika berlaku), timestamp, siapa/proses apa yang memicu

Provenance ini yang nanti disimpan bersama aset (lihat `06-storage-architecture.md` §3) dan menjadi bahan QC + audit.
