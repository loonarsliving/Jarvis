# Riset: Arsitektur MK Connect & Modul Content AI (KontenAI)

Sumber: eksplorasi read-only terhadap repo `loonarsliving/mkhsistem` (tidak ada perubahan dilakukan). Semua path relatif terhadap root repo tersebut.

## 1. Ringkasan Stack MK Connect

- Next.js 15 (App Router), React 19, TypeScript strict. Nama paket: `mk-connect`.
- Layering: `app/` (routing saja) → `features/*/actions` (Server Actions + validasi) → `repositories/` (query Supabase murni) → `services/` (logika lintas-repository) → `lib/`.
- Database: **Supabase** (Postgres + Auth + Storage + Realtime + RLS). Tidak pakai ORM — migration SQL murni (189 file di `supabase/migrations/`), tipe di-generate ke `types/database.types.ts`.
- Auth: Supabase Auth, RBAC granular berbasis tabel (`roles`, `permissions`, `role_permissions`), ditegakkan dua lapis: `requirePermission()` di setiap Server Action + RLS Postgres.
- Hosting: app utama di Vercel; worker render/Veo (butuh durasi panjang, tidak cocok serverless) berjalan sebagai container terpisah (`Dockerfile.render-worker`, dijalankan di Railway) menjalankan `scripts/worker-main.ts`.
- Ada juga shell native (Capacitor, Android) yang membungkus web app produksi.

## 2. Modul-modul MK Connect (konteks, bukan fokus utama)

Attendance, CRM, HR (discipline/finance), Markom (marketing & komunikasi — content planner, content studio, ads), KontenAI (Content AI), FRIDAY (executive intelligence briefing lintas-domain), Loonars Beauty, Kos Occupancy, dan modul administratif standar (employees, branches, divisions, dst). KontenAI adalah satu-satunya modul yang relevan langsung untuk desain AI Asset Factory.

## 3. Modul Content AI (KontenAI) — Pipeline Lengkap

Pipeline yang didesain (dan sebagian sudah berjalan): **Asset Library → Gemini Vision Analysis → AI Director (Creative Brief) → Storyboard Engine → Asset Selector → Render Engine (+ Veo fallback) → Publishing Engine → Analytics → Learning Engine → (harusnya) balik ke AI Director**.

### 3.1 Asset Library
Tabel `kontenai_assets` (migration `0157`): title, description, filename, `asset_type` (image/video/audio/logo/brand_guideline/font/template/document), storage_path, public_url, resolution, duration, dan dimensi klasifikasi bebas-teks (`company, project, campaign, platform, content_type, status, tags[]`) — sengaja generic karena melayani banyak brand sekaligus (leasehold, occupancy, beauty). Ada kolom `search_text tsvector` untuk full-text search. Sejak migration `0167`, dual-backend: `storage_provider` = `'supabase'` (legacy) atau `'google_drive'` (default baru).

### 3.2 Gemini Vision Analysis
Setiap aset dianalisis oleh Gemini Vision untuk menghasilkan metadata otomatis: `aiTitle`, `aiDescription`, `aiTags`, `aiCategory`, `aiMood`, `aiDetectedObjects`, plus `ai_scene_summary` untuk video. Ini yang jadi basis pencarian/pencocokan di tahap-tahap berikutnya.

### 3.3 AI Director — Brief System
**Ini adalah sistem "Brief" MK Connect.** Form input manusia sangat tipis: `objective`, `platform`, `targetAudience`, `productProject`, `campaignGoal` — divalidasi manual di server action (bukan zod, beda dari modul lain). Server action (`lib/ai/domains/kontenai-director.ts`):
1. Menarik *grounding context* — sampel aset yang sudah dianalisis Gemini Vision, difilter by product/platform.
2. Membangun prompt besar (Bahasa Indonesia) berisi objective+audience+goal+deskripsi aset-aset grounding.
3. Memanggil Gemini dengan `responseFormat: "json"`, memaksa struktur output: `bigIdea, hook, keyMessage, targetEmotion, cta, contentAngle`, plus objek `productionDirection` detail (music, voiceOver, visual, caption, avoid, successCriteria).
4. Parsing defensif — setiap field punya fallback coercion, sehingga respons LLM yang sebagian rusak tidak menggagalkan seluruh brief.
5. Disimpan ke `kontenai_creative_briefs` bersama `referenced_asset_ids` (traceability).

Ada juga jalur otomatis: checklist Markom (`kpi_tasks`) dengan `content_focus` tertentu bisa memicu brief tanpa form manusia sama sekali (lewat `ai_job_queue`).

**Catatan penting**: ada implementasi paralel yang lebih lama berbasis mock-db/template (bukan Supabase, bukan LLM) yang masih ada di codebase sebagai scaffolding — pola "real path vs mock path berdampingan" ini berulang di hampir semua submodul KontenAI.

### 3.4 Storyboard Engine
Brief → prompt Gemini lain → array scene (`sceneTitle, visualDescription, cameraAngle, shotType, motion, voiceOver, onScreenText, durationSeconds`) disimpan sebagai `jsonb[]` (replace-on-edit, bukan child table).

### 3.5 Asset Selector
**Kelemahan kunci ditemukan di sini.** Pencocokan scene↔asset murni **text/tag overlap (Jaccard similarity)** atas metadata hasil Gemini Vision — bukan embedding/semantic search. Ada bonus untuk exact-tag-hit, ada heuristik diversity supaya asset tidak dipakai berulang mekanis. Threshold kepercayaan rendah (`LOW_CONFIDENCE_SCORE_THRESHOLD = 25`): di bawah itu → otomatis antre job Veo (image-to-video) sebagai fallback, *hanya jika* Veo dikonfigurasi; kalau tidak, match lemah tetap dipakai tanpa ada yang diberi tahu ada gap. Asset pool discope oleh `content_focus`; kalau field-nya null, pool bisa jadi lebih luas/sempit dari yang dimaksud tanpa disadari.

### 3.6 Render Engine
**Ini bagian yang nyata & jalan** (bukan mock). FFmpeg assembly: gambar di-loop sesuai durasi scene atau video di-trim, di-scale/pad ke dimensi platform target, 24fps, fade in/out sederhana. Audio: narasi TTS Gemini atau silent track, selalu ada (agar concat FFmpeg tidak mismatch codec). Musik dicampur dengan narasi di-duck. Worker (`scripts/render-worker.ts`) adalah polling loop standalone di luar Vercel karena durasi render bisa melebihi limit serverless. Job claim atomik (mencegah double-processing lintas worker instance) — desain yang benar.
**Kelemahan**: *tidak ada retry/backoff sama sekali* — sekali gagal (misal network blip saat download asset), job permanen `failed`. Output eksplisit berlabel "draft" (480p, preset ultrafast x264) — belum publish-ready. Worker tunggal = single point of failure, tanpa alerting bawaan kalau proses macet.

### 3.7 Veo Bridge (fallback video generation)
Nyata dan closed-loop otomatis: worker Veo (`scripts/veo-worker.ts`) memproses job dari Asset Selector, generate klip dari gambar match-lemah sebagai starting frame, upload hasil sebagai entri Asset Library baru (`content_type: "veo_generated"`), replace `selectedAssetId` scene. Setelah semua scene storyboard punya asset, render job **otomatis** diantrekan tanpa klik manusia. Veo hanya dipakai sebagai fallback untuk scene match-lemah — reuse aset statis selalu dicoba dulu. Kelemahan sama: tidak ada retry; polling ~10 menit per generation dijalankan serial (bukan paralel) dalam loop worker.

### 3.8 Publishing Engine
**Stub total — ini gap paling signifikan.** Struktur lengkap ada (pilih render job selesai → generate caption/hashtag via Gemini → simpan ke `kontenai_publish_schedules`), tapi setiap adapter platform (Instagram, Facebook, TikTok, YouTube Shorts) adalah `stubAdapter(...)` — selalu mengembalikan `success: false`. Komentar kode eksplisit: *"siapkan struktur integrasi API untuk setiap platform, belum perlu implementasi penuh."* Tidak ada cron yang mengeksekusi jadwal — publish hanya lewat tombol manual UI, jadi baris "scheduled" tidak pernah benar-benar terbit sendiri.

(Catatan: ada pipeline publish yang *benar-benar berjalan otomatis* di modul lain — Content Studio/Zernio, via `app/api/social/publish-content` yang di-trigger pg_cron tiap 5 menit — tapi itu jalur terpisah dari render KontenAI, hanya terhubung secara konseptual lewat satu kolom bridge.)

### 3.9 Analytics, Learning Engine, AI Optimization, AI Report
Dashboard analytics dan generator rekomendasi optimasi (hook/caption/CTA/durasi/visual/jam posting) **nyata berjalan** secara komputasi — tapi datanya (`kontenai_content_performance`: views/reach/likes/dst.) **diisi manual oleh manusia**, karena Publishing Engine yang stub tidak pernah menghasilkan post ID nyata untuk ditarik statistiknya. **Tidak ada feedback loop**: rekomendasi optimasi yang dihasilkan AI tidak pernah dibaca kembali oleh prompt AI Director — jadi rantai "publish → tarik statistik → feed learning → sesuaikan brief berikutnya" putus di titik paling awal (publish). AI Report menarasikan angka performa yang sama (manual-entry) secara periodik, dipicu manual, bukan cron.

## 4. Sistem Brief — Rangkuman Desain yang Layak Ditiru

Pola implementasi Brief System yang solid dan layak dipertahankan di AI Asset Factory:
- Form intent tipis di sisi manusia, divalidasi longgar (bukan skema kaku) — beban terbesar ada di prompt-construction, bukan di form.
- Satu file domain (`lib/ai/domains/*.ts`) yang memegang penuh: prompt string + parsing/coercion defensif terhadap output LLM yang berantakan — filosofi "jangan pernah percaya LLM lengkap 100%, tapi jangan buang brief yang sebagian bagus."
- Repository layer menyimpan **input mentah manusia + output terstruktur AI dalam satu baris** — traceability penuh.
- Brief dapat dipicu manual (form) maupun otomatis (dari checklist/automation) — tabel yang sama melayani keduanya via kolom opsional (`kpi_task_id`).

## 5. Integrasi AI & Storage yang Sudah Ada

- **Provider AI**: satu-satunya, Google Gemini (`@google/genai`), lewat abstraksi `AIProvider` yang sudah didesain provider-agnostic (tinggal tambah 1 switch-case untuk provider lain). Semua panggilan lewat retry/backoff terpusat.
- **Video generation**: Google Veo (`veo-2.0-generate-001`), image-to-video, dipanggil hanya dari worker standalone (bukan Server Action) karena durasi panjang.
- **Storage**: dual-backend Supabase Storage (legacy) + **Google Drive** (default baru untuk KontenAI, via service account JWT, folder hierarki company/project/campaign dibuat idempoten). Ini **modal awal yang sangat relevan** untuk desain storage AI Asset Factory di `06-storage-architecture.md` — struktur folder dan pola akses sudah ada presedennya di MK Connect dan sebaiknya kompatibel/selaras, bukan bertentangan.
- **RBAC KontenAI**: seluruh tabel `kontenai_*` masih dikunci ke `app_is_super_admin()` — modul ini secara resmi masih berstatus eksperimental/terbatas di MK Connect.

## 6. Kesimpulan: Kelemahan & Peluang untuk AI Asset Factory

| Area | Kondisi di KontenAI (MK Connect) | Peluang untuk AI Asset Factory |
|---|---|---|
| Pencocokan aset | Text/tag overlap saja, tanpa embedding | Bangun index embedding semantik sejak awal + metadata terstruktur kaya |
| Konsistensi produk/karakter | Tidak ada mekanisme sama sekali (tidak dibahas di kode) | Ini jadi *core differentiator* AI Asset Factory (lihat `03-consistency-framework.md`) |
| Retry/resilience | Tidak ada retry di render maupun Veo job | Job queue dengan retry+backoff+dead-letter sejak desain awal |
| Quality control | Tidak ada validasi otomatis kualitas/brand fidelity | Bangun QC scoring gate sebelum asset naik status "usable" (`05-quality-control.md`) |
| Feedback loop | Terputus total (recommendation → dead end) | Desain feedback loop closed dari awal, walau publish/analytics tetap domain MK Connect |
| Prompt sebagai sistem | Prompt tertanam di kode per-domain, tidak diversion/di-track terpisah | Prompt Engine dengan versioning, template library, evolusi berbasis skor QC (`04-prompt-engine.md`) |
| Provenance metadata | Ada `referenced_asset_ids`, tapi tidak ada prompt-persis/model-version/seed tersimpan sistematis | Provenance lengkap wajib per aset sejak hari pertama |
| Storage | Google Drive sudah dipakai KontenAI dengan pola folder company/project/campaign | Selaraskan struktur AI Asset Factory dengan pola ini agar aset langsung "kebaca" saat KontenAI matang |
