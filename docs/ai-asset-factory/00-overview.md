# AI Asset Factory — Overview & Project Relationship

Status: **Phase 0 — Architecture, Research & Planning.** No code has been written for AI Asset Factory yet. This document set is the deliverable for that phase.

## 1. Apa ini

**AI Asset Factory** adalah sistem produksi internal milik PT Maha Karya Haluoleo yang tugasnya satu: memproduksi aset visual premium (foto produk, video, materi karakter/UGC-style) secara terus-menerus dan konsisten, dalam volume besar, dengan kualitas yang bisa dipakai langsung untuk kebutuhan komersial.

**AI Asset Factory bukan pengganti MK Connect.** MK Connect (repo `mkhsistem`) adalah platform SaaS utama perusahaan — ERP, CRM, HR, attendance, dan di dalamnya ada modul Content AI ("KontenAI") yang mengonsumsi aset visual untuk membangun storyboard, merender video, dan (idealnya) mempublikasikan konten.

Analogi yang dipakai sebagai kontrak desain sepanjang dokumen ini:

> **AI Asset Factory = Pixar Studio.** Memproduksi aset sinematik berkualitas tinggi, terkurasi, dan reusable.
> **MK Connect Content AI = Editor Film.** Mengambil aset-aset itu, menyusun cerita/storyboard, dan menerbitkannya sebagai konten pemasaran.

Semakin baik AI Asset Factory memproduksi aset, semakin pintar dan semakin baik output Content AI di MK Connect — tanpa AI Asset Factory perlu tahu atau peduli bagaimana Content AI menyusun kontennya.

## 2. Aturan dasar (non-negotiable)

- **Repo `loonarsliving/mkhsistem` (MK Connect) tidak pernah diubah oleh pekerjaan ini.** Statusnya read-only riset/referensi. Semua pembelajaran tentang MK Connect ada di `01-research-mkconnect.md`.
- **AI Asset Factory dibangun di repo `loonarsliving/jarvis`** (repo ini), sebagai sistem yang berdiri sendiri (standalone), bukan modul di dalam `mkhsistem`.
- Integrasi antara kedua sistem — kalau/ketika dibutuhkan — terjadi lewat **kontrak data eksplisit** (Google Drive sebagai storage bersama + metadata terstruktur + kemungkinan API), bukan lewat berbagi codebase atau database langsung.
- Fase ini murni riset & desain. Implementasi kode baru dimulai setelah dokumen-dokumen ini direview dan disetujui.

## 3. Kenapa AI Asset Factory perlu berdiri sendiri, bukan "perbaiki KontenAI saja"

Riset mendalam terhadap modul KontenAI di MK Connect (lihat `01-research-mkconnect.md` §6) menunjukkan modul itu punya pipeline yang secara konsep sudah benar (Asset Library → Vision Analysis → AI Director → Storyboard → Asset Selector → Render → Publish → Analytics → Learning), tapi separuh dari tahap-tahap hilirnya masih **scaffolding**: Publishing Engine full-stub (tidak ada platform yang benar-benar publish), Analytics diisi manual (bukan ditarik dari API), dan feedback loop dari Learning Engine ke AI Director **tidak tersambung sama sekali**.

Ini adalah sinyal penting, bukan aib: KontenAI dibangun sebagai bagian dari SaaS besar dengan puluhan modul lain (CRM, HR, attendance, dst.), sehingga tim tidak punya ruang untuk mendalami satu hal — produksi aset — sampai benar-benar excellent. **AI Asset Factory mengisi celah itu secara sengaja**: sebuah sistem yang HANYA fokus pada satu masalah (memproduksi aset visual sekonsisten dan sebagus mungkin), dan menyerahkan urusan storyboard/publish/campaign ke MK Connect Content AI.

Implikasi desain:
- AI Asset Factory **tidak perlu** membangun ulang Publishing Engine, scheduler, atau CRM campaign — itu tanggung jawab MK Connect.
- AI Asset Factory **wajib** unggul di hal yang KontenAI masih lemah: konsistensi produk/karakter, kualitas prompt, kontrol kualitas otomatis, dan organisasi aset yang benar-benar reusable & tercari (searchable).
- Titik temu kedua sistem adalah **aset + metadata**, disimpan di Google Drive dengan struktur yang bisa langsung dibaca ulang oleh KontenAI's Asset Library (yang sudah punya integrasi Google Drive — lihat `01-research-mkconnect.md` §7) — sehingga saat KontenAI Publishing Engine-nya nanti dibenahi, "bahan baku" premium sudah menunggu.

## 4. Struktur dokumen

| Dokumen | Isi |
|---|---|
| `00-overview.md` | Dokumen ini |
| `01-research-mkconnect.md` | Hasil riset lengkap arsitektur MK Connect, modul Content AI, Brief System, kelemahan & peluang |
| `02-research-market.md` | Riset kompetitor (Runway, Kling, Veo, HeyGen, dll) + DAM enterprise + pola yang layak ditiru |
| `03-consistency-framework.md` | Framework Product Lock & Character Lock |
| `04-prompt-engine.md` | Desain Prompt Intelligence Engine |
| `05-quality-control.md` | Desain sistem Quality Control otomatis |
| `06-storage-architecture.md` | Desain Google Drive sebagai master storage |
| `07-system-architecture.md` | Arsitektur sistem AI Asset Factory: modul, alur kerja, database, UI |
| `08-roadmap-risks.md` | Roadmap, analisis risiko, rekomendasi |

## 5. Prinsip desain yang mengikat semua dokumen berikut

1. **Setiap aset yang dihasilkan harus reusable** — bukan sekali pakai. Disimpan dengan metadata lengkap, bukan cuma file.
2. **Setiap aset yang dihasilkan harus meningkatkan nilai perusahaan** — baik langsung (dipakai campaign) maupun tidak langsung (memperkaya reference library / training data internal).
3. **Konsistensi produk & karakter adalah prioritas tertinggi**, di atas kecepatan atau volume.
4. **Provenance wajib**: setiap aset membawa jejak lengkap — brief asal, prompt persis yang dipakai, referensi yang dipakai, model/versi, skor QC — persis pola yang absen di KontenAI (lihat `01-research-mkconnect.md` §3) dan pola yang ditemukan sebagai *best practice* di riset kompetitor (Adobe Content Credentials, lihat `02-research-market.md`).
5. **Manusia tetap jadi gerbang terakhir** untuk approval, tapi otomasi menangani sebanyak mungkin triase sebelum sampai ke manusia (pola "auto-filter + human gate" dari riset QC).
