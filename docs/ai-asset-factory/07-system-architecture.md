# Arsitektur Sistem: AI Asset Factory

Status: desain tingkat modul & database untuk fase perencanaan. Belum ada kode. Detail skema final akan disempurnakan saat implementasi, dokumen ini adalah kontrak desain awal.

## 1. Peta Modul

```
                     +---------------------------+
                     |   Brief / Intake Module    |
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Identity Module           |  <-- Product DNA / Character DNA
                     |   (onboarding + versioning) |      (03-consistency-framework.md)
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Prompt Engine              |  (04-prompt-engine.md)
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Generation Orchestrator    |  <-- job queue, provider abstraction
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Quality Control Gate       |  (05-quality-control.md)
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Review & Approval Console  |  <-- human-in-the-loop
                     +-------------+---------------+
                                   v
                     +---------------------------+
                     |   Storage & Index (Drive)    |  (06-storage-architecture.md)
                     +---------------------------+
                                   ^
                                   |  dikonsumsi oleh (kontrak data, bukan integrasi codebase)
                     +---------------------------+
                     |   MK Connect Content AI      |  (di luar scope AI Asset Factory)
                     +---------------------------+
```

## 2. Deskripsi Modul

### 2.1 Brief / Intake Module
Mengambil pola solid dari MK Connect (`01-research-mkconnect.md` §4): form intent tipis (objective, target platform, produk/karakter yang dipakai, mood/goal), divalidasi longgar, disimpan bersama output turunannya untuk traceability. Berbeda dari KontenAI: brief di sini secara eksplisit menyatakan **produk/karakter mana** (referensi ke Identity Module) yang harus dipakai — bukan asumsi implisit.

Brief bisa dibuat manual (form) atau terprogram (dipicu oleh sistem lain lewat API — termasuk berpotensi dari MK Connect di masa depan).

### 2.2 Identity Module
Mengelola siklus hidup Product DNA & Character DNA (`03-consistency-framework.md`): intake → generate turnaround sheet → human approval → versioning. Ini adalah modul dengan hambatan tertinggi untuk diubah sembarangan (banyak generation bergantung padanya) — perubahan selalu additive (versi baru), tidak pernah destruktif.

### 2.3 Prompt Engine
Mengkomposisi prompt final dari brief + DNA record + template terpilih (`04-prompt-engine.md`). Memegang template library dengan versioning & regression testing. Menjadi target utama loop evolusi berbasis skor QC.

### 2.4 Generation Orchestrator
Job queue yang mengabstraksi pemanggilan model generation eksternal (image/video gen provider — bisa lebih dari satu, mengikuti pola provider-agnostic yang sudah dipakai MK Connect untuk Gemini, `01-research-mkconnect.md` §5). Tanggung jawab:
- Antre & eksekusi job generation
- **Retry + exponential backoff + dead-letter queue** — ini secara sengaja mengisi celah yang ditemukan di render/Veo worker MK Connect yang tidak punya retry sama sekali (`01-research-mkconnect.md` §3.6–3.7)
- Menyimpan provenance lengkap tiap job (prompt final, referensi, model/versi, seed)

### 2.5 Quality Control Gate
Menjalankan pemeriksaan otomatis (`05-quality-control.md`) segera setelah generation selesai, sebelum aset terlihat oleh siapa pun sebagai kandidat "usable".

### 2.6 Review & Approval Console
UI untuk manusia menyetujui/menolak aset yang di-flag QC Gate (bukan semua aset — hanya yang masuk zona menengah atau butuh approval identitas baru). Lihat §5 untuk detail UI planning.

### 2.7 Storage & Index
Google Drive sebagai penyimpanan fisik (`06-storage-architecture.md`) + database index (metadata, bukan file besar) untuk pencarian cepat (full-text + tag + embedding semantik — mengisi celah Asset Selector MK Connect yang hanya text/tag overlap, `01-research-mkconnect.md` §3.5).

## 3. Perencanaan Database (Konseptual)

Entitas inti (nama tabel indikatif, final ditentukan saat implementasi):

- `identities` — Product DNA & Character DNA (satu tabel dengan kolom `kind: product|character`, atau dua tabel terpisah — keputusan implementasi), dengan `version`, `status` (`draft|approved|deprecated`), `canonical_reference_asset_id`, field-field DNA terstruktur (jsonb untuk fleksibilitas, kolom eksplisit untuk field yang sering di-query seperti `status`, `kind`, `slug`).
- `briefs` — input manusia/otomatis, mirror pola MK Connect: raw input + output terstruktur (jika ada tahap AI-assisted brief refinement) dalam satu baris.
- `prompt_templates` — versi template, status (`draft|production|deprecated`), metrik agregat performa.
- `generation_jobs` — job queue: status (`queued|running|completed|failed|dead_letter`), `attempt_count`, `next_retry_at`, referensi ke brief, identity, template, provider yang dipakai.
- `assets` — hasil generation: path storage, metadata provenance lengkap (§ lihat `06-storage-architecture.md` §4), `status` (`raw|approved|rejected|superseded`), `qc_report_id`.
- `qc_reports` — skor per dimensi per aset, keputusan (`auto_approve|flag_review|auto_reject`), timestamp.
- `reviews` — keputusan manusia atas aset yang di-flag: `reviewer`, `decision`, `note`, `reviewed_at`.

Prinsip desain DB (diambil dari observasi baik MK Connect maupun riset DAM):
- Simpan **input mentah + output terstruktur bersama**, jangan pisah tanpa alasan kuat (memudahkan audit/debug).
- Gunakan `jsonb` untuk field yang secara alami fleksibel (DNA attributes, QC report detail), kolom eksplisit untuk apa pun yang sering jadi filter/index (status, kind, version).
- Tidak ada hard-delete pada `identities` atau `assets` yang sudah pernah dipakai produksi — hanya perubahan status (`deprecated`/`superseded`), demi audit trail.

## 4. Alur Kerja End-to-End

```
1. Brief dibuat (manual/otomatis) -> menyebut Product/Character DNA yang dipakai
2. Prompt Engine mengkomposisi N variasi prompt (base + variation axis)
3. Generation Orchestrator mengantre & mengeksekusi tiap prompt ke provider generation
4. Setiap hasil masuk QC Gate otomatis
5a. Lolos ambang tinggi semua dimensi -> auto-approve -> status "approved" -> masuk index & Drive folder /approved
5b. Zona menengah -> masuk antrean Review Console -> manusia putuskan
5c. Gagal ambang identitas -> auto-reject -> dicatat, opsional requeue generation dengan prompt/param berbeda
6. Skor QC teragregasi -> feed ke Prompt Engine evolution loop (04-prompt-engine.md §5)
7. Aset "approved" tersedia di storage terindeks -> siap dikonsumsi MK Connect Content AI kapan saja modul itu siap
```

## 5. UI Planning (Tingkat Tinggi)

Halaman inti yang dibutuhkan (final detail UI menyusul saat desain implementasi):
- **Dashboard produksi**: status job generation, antrean review, throughput harian
- **Identity Manager**: daftar Product/Character DNA, status approval, riwayat versi, tombol "buat versi baru"
- **Brief Composer**: form intake brief, pilih identity yang dipakai, pilih template/preset
- **Review Console**: kandidat aset yang di-flag, tampilkan skor QC per dimensi + alasan flag, aksi approve/reject/reject-with-reason
- **Asset Library Browser**: pencarian aset approved (filter by company/project/campaign/tag/identity), preview + metadata provenance penuh
- **Template Manager**: daftar prompt template, versi, status, metrik performa, uji terhadap regression set
- **Analytics ringan**: skor QC dari waktu ke waktu per template/per identity (untuk mendukung loop evolusi, bukan analytics campaign — itu tetap domain MK Connect)

## 6. Batas Tegas dengan MK Connect (Scope Boundary)

AI Asset Factory **tidak** membangun: campaign management, publishing ke platform sosial, scheduling publish, analytics performa konten (views/engagement), CRM/sales apa pun. Semua itu tetap domain MK Connect. Titik integrasi satu-satunya adalah: **aset + metadata provenance yang tersimpan rapi di Google Drive dengan struktur yang bisa dibaca ulang** — dan, jika suatu saat dibutuhkan, API tipis untuk MK Connect meminta/memicu produksi aset baru secara terprogram.
