# PRD — Canva OTP Relay

**Dokumen**: Product Requirement Document & Technical Specification
**Status**: Draft v1.0 — Ready for Execution
**Klasifikasi**: Internal Tool (Trusted Team Only)
**Author**: Senior Software Architect & Technical Product Manager
**Terakhir diperbarui**: Agustus 2026

---

## Daftar Isi

1. [Executive Summary & Scope](#1-executive-summary--scope)
2. [System Architecture & Data Flow](#2-system-architecture--data-flow)
3. [Database Schema & Data Model](#3-database-schema--data-model)
4. [API Routes & Core Logic Specification](#4-api-routes--core-logic-specification)
5. [UI/UX & Feature Specifications](#5-uiux--feature-specifications)
6. [Environment Variables & Security Guidelines](#6-environment-variables--security-guidelines)
7. [Step-by-Step Implementation Roadmap](#7-step-by-step-implementation-roadmap)
8. [Appendix](#8-appendix)

---

## 1. Executive Summary & Scope

### 1.1 Goal

Membangun sebuah **internal relay dashboard** yang secara otomatis menangkap kode OTP / kode verifikasi login dari email masuk Canva (`ceksosial3@gmail.com`) di satu mailbox Gmail bersama milik tim, lalu menampilkannya secara real-time ke anggota tim yang berwenang — **tanpa** anggota tim tersebut perlu mengetahui password atau login langsung ke inbox Gmail tersebut.

### 1.2 Problem Statement

| Masalah | Dampak |
|---|---|
| Akun Canva tim bersifat *shared account*, dan proses login membutuhkan OTP yang dikirim ke satu Gmail bersama | Setiap kali ada anggota yang perlu login, harus ada satu orang "pemegang akses" yang membuka inbox dan meneruskan kode secara manual (via chat/WA) |
| Memberi akses penuh ke inbox Gmail tim ke semua anggota | Resiko keamanan tinggi — email lain (billing, reset password akun lain, data sensitif tim) ikut terekspos |
| Proses manual forwarding kode OTP | Lambat, rawan human error, dan tidak scalable ketika tim bertambah besar |

### 1.3 Solusi Sederhana (Scope: OTP Relay Only)

Aplikasi ini **hanya** melakukan satu hal secara sangat baik: mendeteksi email OTP/verifikasi masuk dari Canva, mengekstrak kodenya, menyimpannya sementara di database, dan menampilkannya di dashboard yang di-protect dengan whitelist email internal. Tidak lebih dari itu.

### 1.4 Batasan Proyek (Scope)

**In-Scope:**
- Autentikasi ke satu mailbox Gmail khusus tim via Gmail API (OAuth2 / Service Account) dengan scope **read-only**, dibatasi ke email dari pengirim Canva.
- Deteksi email baru dari `ceksosial3@gmail.com` (via Gmail Push Notification / polling cron).
- Ekstraksi kode OTP 6 digit dari subjek/body email menggunakan regex.
- Penyimpanan log OTP ke database dengan mekanisme idempotency (anti-duplikat).
- Dashboard internal menampilkan kode OTP terbaru + riwayat 5–10 kode terakhir.
- Real-time sync ke UI ketika kode baru masuk.
- Access control sederhana berbasis whitelist email (Google OAuth login).
- Auto-expire OTP setelah 10 menit (sesuai umumnya masa berlaku OTP Canva).

**Out-of-Scope (Tidak dikerjakan di versi ini):**
- Tidak menangani OTP dari layanan lain selain Canva (Netflix, Spotify, dll) — meskipun skema DB dirancang cukup generik untuk ekspansi di masa depan.
- Tidak melakukan otomatisasi login ke Canva (auto-fill OTP ke halaman login Canva). Dashboard bersifat *read-only relay*, bukan bot login.
- Tidak ada fitur manajemen user/role kompleks (admin panel, role hierarchy). Whitelist cukup berupa daftar email statis.
- Tidak ada notifikasi push ke HP (WhatsApp/Telegram bot) di versi 1 — cukup web dashboard. (Bisa jadi fase 2.)
- Tidak menyimpan isi email secara penuh — hanya field yang relevan (sender, kode, waktu, subjek ringkas) untuk meminimalkan data sensitif yang tersimpan.
- Tidak dirancang untuk multi-tenant / multi-organisasi. Single team, single mailbox.

> **Catatan kepatuhan**: Karena akun Canva yang digunakan berupa akun bersama (shared) milik tim internal, pastikan penggunaannya sesuai dengan jenis lisensi/paket Canva yang dipakai tim (mis. Canva Teams yang memang didesain untuk multi-user), bukan akun individual yang di-share ke banyak orang secara diam-diam.

### 1.5 Target Pengguna

Tim kecil (estimasi 3–15 orang) yang sudah saling percaya (trusted team) — misalnya tim kreatif/konten yang berbagi satu akun Canva Teams.

---

## 2. System Architecture & Data Flow

### 2.1 Pilihan Database: Supabase vs Firebase

| Kriteria | Supabase (PostgreSQL) | Firebase (Firestore) |
|---|---|---|
| Realtime listener | Native via `postgres_changes` (WebSocket) | Native via `onSnapshot` |
| Struktur data OTP (relational, punya status/expiry) | Sangat cocok — tabel relasional dengan constraint | Cocok, tapi lebih natural untuk data non-relasional |
| Auth + whitelist email | Supabase Auth + Row Level Security (RLS) by email domain/list — sangat rapi | Firebase Auth + Firestore Security Rules — juga bisa, sedikit lebih verbose |
| Query "OTP terbaru yang belum expired" | SQL native: `WHERE expires_at > now() ORDER BY received_at DESC LIMIT 1` | Perlu composite index di Firestore |
| Cron/serverless integration dengan Next.js di Vercel | Supabase client ringan, cocok dipakai di Edge/Node runtime | Firebase Admin SDK agak berat untuk cold start di serverless |
| Biaya di skala kecil | Free tier cukup generous | Free tier (Spark) juga cukup |

**Rekomendasi: Supabase (PostgreSQL + Realtime + Auth)**

Alasan utama: data OTP bersifat **relational dan time-bound** (punya `expires_at`, `status`, perlu query terurut & filter kondisi), yang jauh lebih natural dan efisien di SQL dibanding NoSQL. Row Level Security (RLS) Supabase juga memungkinkan kita menerapkan whitelist email langsung di level database, bukan hanya di middleware — defense in depth.

> Arsitektur di bawah menggunakan Supabase sebagai pilihan utama. Jika tim tetap ingin Firebase, semua logic (regex, idempotency, UI) tetap sama — hanya layer database yang berbeda (Firestore collection `otp_logs` sebagai pengganti tabel).

### 2.2 High-Level Architecture Diagram

```mermaid
flowchart TD
    A[Canva Login Attempt] -->|Mengirim OTP| B[Gmail Inbox Tim<br/>ceksosial3@gmail.com]
    B -->|Gmail Push Notification<br/>via Cloud Pub/Sub| C[Next.js API Route<br/>/api/webhooks/gmail]
    B -.->|Fallback: Polling tiap interval| D[Next.js API Route<br/>/api/cron/fetch-otp<br/>Vercel Cron]
    C --> E[Gmail API: messages.get]
    D --> E
    E --> F[Extractor Service<br/>Regex Parser + Sender Filter]
    F --> G{Idempotency Check<br/>gmail_message_id unik?}
    G -->|Sudah ada| H[Skip / Ignore]
    G -->|Baru| I[(Supabase PostgreSQL<br/>tabel otp_logs)]
    I -->|Realtime Broadcast<br/>postgres_changes| J[Next.js Dashboard UI]
    K[User Login via Supabase Auth<br/>Google OAuth + Whitelist Check] --> J
    J -->|Render| L[Card OTP Terbaru + History]
```

### 2.3 Alur Data Detail (Step by Step)

1. **Trigger**: Seseorang di tim mencoba login ke Canva → Canva mengirim email berisi kode OTP 6 digit ke inbox Gmail tim (`from: ceksosial3@gmail.com`).
2. **Deteksi Email Baru** — dua strategi (disarankan pakai keduanya, saling backup):
   - **Primary — Gmail Push Notification (near real-time, < 5 detik)**: Gmail API `users.watch()` didaftarkan ke topic Google Cloud Pub/Sub. Setiap ada email baru masuk ke inbox, Google mengirim POST request ke endpoint webhook kita (`/api/webhooks/gmail`).
   - **Fallback — Polling via Vercel Cron**: Endpoint `/api/cron/fetch-otp` dipanggil secara berkala untuk melakukan `messages.list` dengan query `from:ceksosial3@gmail.com newer_than:1d`, sebagai jaring pengaman jika webhook gagal/telat.
   > ⚠️ **Catatan penting Vercel Cron**: Pada Vercel plan **Hobby**, cron job hanya bisa dijalankan **maksimal 1x per hari**. Untuk polling yang lebih sering (mis. tiap 1–5 menit), dibutuhkan **Vercel Pro plan**. Karena itu, strategi *Gmail Push Notification* adalah jalur utama untuk mencapai near-real-time, dan cron polling difungsikan sebagai reconciliation job (mis. tiap 1 jam atau harian) untuk menangkap email yang mungkin terlewat oleh webhook.
3. **Fetch Detail Email**: Menggunakan `gmail.users.messages.get()` dengan `messageId` yang diterima, ambil payload email (subject + body/snippet).
4. **Ekstraksi Kode OTP**: Sender difilter memastikan berasal dari domain Canva resmi, lalu body/subject diparse dengan regex untuk menemukan 6 digit kode.
5. **Idempotency Check**: Sebelum insert, cek apakah `gmail_message_id` sudah pernah tersimpan di tabel `otp_logs`. Jika sudah ada → skip (tidak insert duplikat).
6. **Simpan ke Database**: Insert row baru ke `otp_logs` dengan `status = 'active'`, `expires_at = received_at + 10 menit`.
7. **Realtime Broadcast**: Supabase Realtime otomatis mem-broadcast perubahan tabel (INSERT event) ke semua client dashboard yang sedang subscribe.
8. **Render di UI**: Dashboard yang sedang terbuka langsung update tanpa perlu refresh manual — kode OTP terbaru muncul di card utama.
9. **Auto-Expire**: Setelah 10 menit, status OTP otomatis dianggap `expired` (dihitung di client-side dari `expires_at`, dan bisa juga dikonfirmasi via scheduled job yang mengubah `status` di DB).

### 2.4 Komponen Sistem

| Komponen | Teknologi | Fungsi |
|---|---|---|
| Frontend | Next.js 15 (App Router) + shadcn/ui + Tailwind | Dashboard UI, auth gate |
| Backend (serverless functions) | Next.js API Routes / Route Handlers | Webhook receiver, cron worker, auth callback |
| Email Source | Gmail API v1 | Baca email dari mailbox tim (read-only scope) |
| Notifikasi Email Baru | Google Cloud Pub/Sub | Push notification real-time dari Gmail |
| Database | Supabase (PostgreSQL) | Simpan log OTP |
| Realtime Sync | Supabase Realtime (WebSocket) | Push update ke UI tanpa refresh |
| Auth | Supabase Auth (Google OAuth Provider) + whitelist table | Login & access control tim |
| Hosting | Vercel | Deploy Next.js app + cron jobs |
| Source Control | GitHub (Private Repo) | Version control, CI/CD trigger ke Vercel |

---

## 3. Database Schema & Data Model

### 3.1 Tabel `otp_logs`

```sql
-- Ekstensi yang dibutuhkan
create extension if not exists "pgcrypto";

create table public.otp_logs (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,                    -- kode OTP 6 digit, cth: "482913"
  sender            text not null default 'ceksosial3@gmail.com',
  subject           text,                              -- subjek email asli (untuk audit/debug)
  gmail_message_id  text not null unique,               -- ID unik dari Gmail, KUNCI idempotency
  gmail_thread_id   text,
  received_at       timestamptz not null,               -- waktu email diterima (dari header Gmail)
  expires_at        timestamptz not null,               -- received_at + interval '10 minutes'
  status             text not null default 'active'
                        check (status in ('active', 'expired', 'used')),
  created_at        timestamptz not null default now()
);

-- Index untuk query "OTP terbaru yang masih aktif"
create index idx_otp_logs_status_received
  on public.otp_logs (status, received_at desc);

-- Index untuk pencarian idempotency super cepat
create unique index idx_otp_logs_gmail_message_id
  on public.otp_logs (gmail_message_id);
```

### 3.2 Penjelasan Kolom

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | Primary key, auto-generate |
| `code` | `text` | Kode OTP hasil ekstraksi regex (disimpan sebagai text untuk menjaga leading zero, mis. `"048213"`) |
| `sender` | `text` | Alamat pengirim, default & validasi harus `ceksosial3@gmail.com` |
| `subject` | `text` | Subjek asli email, untuk keperluan debugging jika regex gagal parsing |
| `gmail_message_id` | `text` (unique) | ID pesan dari Gmail API — **kunci utama idempotency** |
| `gmail_thread_id` | `text` | ID thread Gmail, opsional untuk tracing |
| `received_at` | `timestamptz` | Waktu email diterima (diambil dari header `Date` Gmail, bukan waktu insert DB) |
| `expires_at` | `timestamptz` | `received_at + 10 menit`, dipakai untuk countdown & filter status |
| `status` | `text` (enum-like) | `active` → `expired` → (opsional `used` jika ingin tandai manual "sudah dipakai") |
| `created_at` | `timestamptz` | Waktu row diinsert ke DB (audit trail) |

### 3.3 Tabel Tambahan: `allowed_users` (Whitelist Akses)

```sql
create table public.allowed_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text,
  added_at    timestamptz not null default now()
);
```

### 3.4 Row Level Security (RLS) Policy

```sql
-- Aktifkan RLS
alter table public.otp_logs enable row level security;
alter table public.allowed_users enable row level security;

-- Hanya user yang emailnya ada di allowed_users yang boleh SELECT otp_logs
create policy "whitelisted_users_can_read_otp"
  on public.otp_logs
  for select
  using (
    auth.jwt() ->> 'email' in (select email from public.allowed_users)
  );

-- Insert ke otp_logs HANYA boleh dari service role (dipakai backend cron/webhook)
-- Tidak ada policy INSERT untuk role 'authenticated' → user biasa tidak bisa insert manual
```

> Endpoint backend (`/api/cron/fetch-otp`, `/api/webhooks/gmail`) melakukan insert menggunakan **Supabase Service Role Key** (bypass RLS), sedangkan client dashboard hanya melakukan `select` menggunakan **anon key** yang terikat RLS di atas. Ini memastikan hanya proses backend resmi yang bisa menulis data.

### 3.5 TypeScript Type Definition

```typescript
// types/otp.ts

export type OtpStatus = "active" | "expired" | "used";

export interface OtpLog {
  id: string;
  code: string;
  sender: string;
  subject: string | null;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  received_at: string; // ISO timestamp
  expires_at: string;  // ISO timestamp
  status: OtpStatus;
  created_at: string;
}
```

---

## 4. API Routes & Core Logic Specification

### 4.1 Struktur Folder API (App Router)

```
src/
└── app/
    └── api/
        ├── cron/
        │   └── fetch-otp/
        │       └── route.ts          # Reconciliation polling job
        ├── webhooks/
        │   └── gmail/
        │       └── route.ts          # Push notification receiver (Pub/Sub)
        ├── auth/
        │   └── callback/
        │       └── route.ts          # Supabase Auth OAuth callback
        └── otp/
            └── latest/
                └── route.ts          # (opsional) REST fallback jika realtime gagal
```

### 4.2 Endpoint: `POST /api/webhooks/gmail`

**Fungsi**: Menerima push notification dari Google Cloud Pub/Sub setiap ada email baru masuk ke inbox Gmail tim.

**Payload dari Pub/Sub (contoh JSON):**

```json
{
  "message": {
    "data": "eyJlbWFpbEFkZHJlc3MiOiJ0ZWFtQGdtYWlsLmNvbSIsImhpc3RvcnlJZCI6IjEyMzQ1Njc4In0=",
    "messageId": "1234567890123456",
    "publishTime": "2026-08-06T02:15:30.123Z"
  },
  "subscription": "projects/canva-otp-relay/subscriptions/gmail-push-sub"
}
```

> Field `data` adalah base64-encoded JSON: `{ "emailAddress": "team@gmail.com", "historyId": "12345678" }`

**Logic:**

```typescript
// src/app/api/webhooks/gmail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";
import { extractOtpFromEmail } from "@/lib/otp-extractor";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verifikasi request benar datang dari Pub/Sub (lihat bagian keamanan)
    // ... verifikasi JWT token dari header Authorization ...

    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString("utf-8")
    );
    const { historyId } = decoded;

    const gmail = await getGmailClient();

    // Ambil daftar perubahan sejak historyId terakhir yang diproses
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
      historyTypes: ["messageAdded"],
    });

    const messages = historyRes.data.history?.flatMap(
      (h) => h.messagesAdded?.map((m) => m.message) ?? []
    ) ?? [];

    for (const msg of messages) {
      if (!msg?.id) continue;
      await processGmailMessage(gmail, msg.id);
    }

    return NextResponse.json({ ok: true, processed: messages.length });
  } catch (err) {
    console.error("[gmail-webhook] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function processGmailMessage(gmail: any, messageId: string) {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = msg.data.payload?.headers ?? [];
  const from = headers.find((h: any) => h.name === "From")?.value ?? "";

  // 1. Filter sender — HARUS dari Canva
  if (!from.toLowerCase().includes("ceksosial3@gmail.com")) {
    return; // abaikan email lain
  }

  // 2. Ekstrak kode OTP
  const result = extractOtpFromEmail(msg.data);
  if (!result) return; // gagal parsing, mungkin bukan email OTP

  const receivedAt = new Date(
    parseInt(msg.data.internalDate ?? `${Date.now()}`, 10)
  );
  const expiresAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);

  // 3. Idempotency: upsert berbasis unique constraint gmail_message_id
  const { error } = await supabaseAdmin.from("otp_logs").upsert(
    {
      code: result.code,
      sender: "ceksosial3@gmail.com",
      subject: result.subject,
      gmail_message_id: messageId,
      gmail_thread_id: msg.data.threadId,
      received_at: receivedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "active",
    },
    { onConflict: "gmail_message_id", ignoreDuplicates: true }
  );

  if (error) console.error("[processGmailMessage] insert error:", error);
}
```

### 4.3 Regex Ekstraksi Kode OTP

Kode OTP Canva umumnya muncul dalam format seperti *"Your verification code is 482913"* atau *"Kode verifikasi Anda: 482913"*. Untuk menghindari salah tangkap angka lain (mis. nomor telepon dukungan, ID transaksi) di body email, regex dirancang bertingkat (context-aware dulu, fallback ke pola umum):

```typescript
// src/lib/otp-extractor.ts

interface ExtractedOtp {
  code: string;
  subject: string;
}

/**
 * Strategi ekstraksi bertingkat:
 * 1. Cari 6 digit yang berdekatan dengan kata kunci "code"/"kode"/"verification"/"OTP".
 * 2. Fallback: ambil 6 digit pertama yang berdiri sendiri (word-boundary) di body.
 */
const CONTEXTUAL_OTP_REGEX =
  /(?:verification code|security code|kode verifikasi|kode keamanan|OTP)\D{0,20}(\d{6})\b/i;

const FALLBACK_OTP_REGEX = /\b(\d{6})\b/;

export function extractOtpFromEmail(payload: any): ExtractedOtp | null {
  const headers = payload.payload?.headers ?? [];
  const subject: string =
    headers.find((h: any) => h.name === "Subject")?.value ?? "";

  const bodyText = getPlainTextBody(payload.payload) ?? "";
  const haystack = `${subject}\n${bodyText}`;

  const contextMatch = haystack.match(CONTEXTUAL_OTP_REGEX);
  if (contextMatch?.[1]) {
    return { code: contextMatch[1], subject };
  }

  const fallbackMatch = haystack.match(FALLBACK_OTP_REGEX);
  if (fallbackMatch?.[1]) {
    return { code: fallbackMatch[1], subject };
  }

  return null; // bukan email OTP yang valid
}

/** Rekursif cari bagian text/plain dari struktur MIME multipart Gmail */
function getPlainTextBody(part: any): string | null {
  if (!part) return null;

  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }

  if (part.parts) {
    for (const sub of part.parts) {
      const found = getPlainTextBody(sub);
      if (found) return found;
    }
  }

  return null;
}
```

### 4.4 Endpoint: `GET /api/cron/fetch-otp` (Reconciliation / Fallback Polling)

**Fungsi**: Dipanggil oleh Vercel Cron secara berkala sebagai jaring pengaman — memastikan tidak ada email OTP yang terlewat oleh webhook.

```typescript
// src/app/api/cron/fetch-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";
import { extractOtpFromEmail } from "@/lib/otp-extractor";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  // Proteksi: hanya Vercel Cron (atau request dengan secret header) yang boleh trigger
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const gmail = await getGmailClient();

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "from:ceksosial3@gmail.com newer_than:1d",
    maxResults: 20,
  });

  const messages = listRes.data.messages ?? [];
  let inserted = 0;

  for (const m of messages) {
    if (!m.id) continue;

    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    });

    const result = extractOtpFromEmail(msg.data);
    if (!result) continue;

    const receivedAt = new Date(
      parseInt(msg.data.internalDate ?? `${Date.now()}`, 10)
    );
    const expiresAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);

    const { error, count } = await supabaseAdmin
      .from("otp_logs")
      .upsert(
        {
          code: result.code,
          sender: "ceksosial3@gmail.com",
          subject: result.subject,
          gmail_message_id: m.id,
          gmail_thread_id: msg.data.threadId,
          received_at: receivedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: "active",
        },
        { onConflict: "gmail_message_id", ignoreDuplicates: true }
      );

    if (!error) inserted++;
  }

  return NextResponse.json({ ok: true, scanned: messages.length, inserted });
}
```

**Konfigurasi `vercel.json`:**

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-otp",
      "schedule": "0 * * * *"
    }
  ]
}
```

> Schedule `0 * * * *` = tiap jam sekali (aman untuk Hobby plan yang membatasi 1x/hari — sesuaikan ke `0 0 * * *` jika masih di plan Hobby). Jika tim upgrade ke Vercel Pro, bisa dipercepat mis. `*/5 * * * *` (tiap 5 menit) sebagai lapisan reconciliation tambahan di samping webhook real-time.

### 4.5 Idempotency — Ringkasan Mekanisme

1. **Unique constraint** di kolom `gmail_message_id` pada level database (bukan hanya di application logic) — ini adalah garda terakhir yang paling reliable.
2. Semua operasi insert menggunakan `upsert(..., { onConflict: "gmail_message_id", ignoreDuplicates: true })` — jika `gmail_message_id` sudah ada, insert baru otomatis di-skip tanpa error.
3. Karena baik webhook maupun cron polling bisa saja memproses email yang sama (mis. webhook sempat gagal lalu cron menyusul), mekanisme ini memastikan **tidak akan ada duplikat** di tabel `otp_logs` meskipun kedua jalur berjalan bersamaan.

---

## 5. UI/UX & Feature Specifications

### 5.1 Halaman & Routing

```
/                      → redirect ke /dashboard (jika login) atau /login
/login                 → halaman login (Google OAuth via Supabase Auth)
/dashboard             → halaman utama (protected)
/unauthorized          → ditampilkan jika email tidak ada di whitelist
```

### 5.2 Dashboard Page — Spesifikasi Komponen

#### A. Card Utama — Kode OTP Terbaru

**Requirement fungsional:**
- Menampilkan kode OTP aktif (`status = 'active'` dan `expires_at > now()`) terbaru berdasarkan `received_at DESC`.
- Kode ditampilkan dalam **font besar, monospace, letter-spacing lebar** agar mudah dibaca & di-copy (mis. `4 8 2 9 1 3`).
- Tombol **"Copy Code"** — klik untuk copy ke clipboard, disertai feedback visual (icon berubah jadi checkmark selama 2 detik + toast "Kode disalin!").
- Indikator waktu relatif: *"2 minutes ago"* — menggunakan library seperti `date-fns` (`formatDistanceToNow`).
- **Countdown expired** dalam format `MM:SS` yang berjalan mundur dari 10:00, dengan progress bar visual. Ketika mencapai 00:00, card otomatis berubah state menjadi "Expired" (redup/disabled) dan menampilkan pesan *"Kode ini sudah kedaluwarsa — tunggu kode baru."*
- Jika tidak ada OTP aktif sama sekali → tampilkan **empty state**: *"Belum ada kode OTP masuk. Kode akan muncul otomatis di sini."*

**Contoh komponen (React + shadcn/ui):**

```tsx
// src/components/otp-card.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Copy, CheckCheck } from "lucide-react";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { OtpLog } from "@/types/otp";
import { toast } from "sonner";

export function OtpCard({ otp }: { otp: OtpLog | null }) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!otp) return;
    const tick = () => {
      const diff = differenceInSeconds(new Date(otp.expires_at), new Date());
      setSecondsLeft(Math.max(diff, 0));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [otp]);

  if (!otp) {
    return (
      <Card className="text-center py-12">
        <CardContent className="text-muted-foreground">
          Belum ada kode OTP masuk. Kode akan muncul otomatis di sini.
        </CardContent>
      </Card>
    );
  }

  const isExpired = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(otp.code);
    setCopied(true);
    toast.success("Kode disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={isExpired ? "opacity-50" : ""}>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground font-normal">
          Kode OTP Terbaru — {formatDistanceToNow(new Date(otp.received_at), {
            addSuffix: true,
            locale: localeId,
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="text-6xl font-mono font-bold tracking-[0.3em]">
          {otp.code}
        </div>

        <Button onClick={handleCopy} disabled={isExpired} size="lg">
          {copied ? <CheckCheck className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Tersalin" : "Copy Code"}
        </Button>

        <div className="w-full space-y-1">
          <Progress value={(secondsLeft / 600) * 100} />
          <p className="text-xs text-center text-muted-foreground">
            {isExpired
              ? "Kode ini sudah kedaluwarsa"
              : `Kedaluwarsa dalam ${minutes}:${seconds.toString().padStart(2, "0")}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### B. Section History

**Requirement fungsional:**
- List 5–10 OTP terakhir (termasuk yang sudah expired), diurutkan `received_at DESC`.
- Tiap item menampilkan: kode (redup jika sudah expired), waktu diterima (format lengkap saat hover, relatif saat default), dan badge status (`Active` / `Expired`).
- Bisa klik untuk copy kode lama juga (berguna untuk audit, walau sudah tidak valid untuk login baru).

```tsx
// src/components/otp-history.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { OtpLog } from "@/types/otp";

export function OtpHistory({ items }: { items: OtpLog[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Riwayat Kode</h3>
      <ul className="divide-y rounded-md border">
        {items.map((item) => {
          const isExpired = new Date(item.expires_at) < new Date();
          return (
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className={`font-mono tracking-widest ${isExpired ? "text-muted-foreground" : ""}`}>
                {item.code}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.received_at), {
                    addSuffix: true,
                    locale: localeId,
                  })}
                </span>
                <Badge variant={isExpired ? "secondary" : "default"}>
                  {isExpired ? "Expired" : "Active"}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

#### C. Real-time Sync Listener

```tsx
// src/hooks/use-otp-realtime.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { OtpLog } from "@/types/otp";

export function useOtpRealtime(initialData: OtpLog[]) {
  const [logs, setLogs] = useState<OtpLog[]>(initialData);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel("otp_logs_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "otp_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as OtpLog, ...prev].slice(0, 10));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return logs;
}
```

### 5.3 Simple Access Control

**Alur:**
1. User membuka `/dashboard` → middleware cek session Supabase Auth.
2. Jika belum login → redirect ke `/login` → tombol "Login dengan Google".
3. Setelah login via Google OAuth, sistem cek: apakah email user ada di tabel `allowed_users`?
   - **Ya** → lanjut ke `/dashboard`.
   - **Tidak** → redirect ke `/unauthorized` dengan pesan *"Email Anda belum terdaftar. Hubungi admin untuk akses."*

**Middleware:**

```typescript
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase-middleware";

export async function middleware(req: NextRequest) {
  const { supabase, response } = createMiddlewareClient(req);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isProtectedRoute = req.nextUrl.pathname.startsWith("/dashboard");

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isProtectedRoute && session) {
    const { data: allowed } = await supabase
      .from("allowed_users")
      .select("email")
      .eq("email", session.user.email)
      .maybeSingle();

    if (!allowed) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

---

## 6. Environment Variables & Security Guidelines

### 6.1 Daftar Environment Variables

Buat file `.env.local` (untuk development) — **JANGAN PERNAH** commit file ini ke Git.

```bash
# ── Supabase ──────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # rahasia, hanya untuk server-side

# ── Google Cloud / Gmail API ─────────────────────
GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//0gxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_PROJECT_ID=canva-otp-relay
GMAIL_PUBSUB_TOPIC=projects/canva-otp-relay/topics/gmail-notifications

# Jika menggunakan Service Account + domain-wide delegation (Google Workspace):
GOOGLE_SERVICE_ACCOUNT_EMAIL=otp-relay@canva-otp-relay.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GMAIL_IMPERSONATE_USER=team@yourcompany.com

# ── Cron & Webhook Security ──────────────────────
CRON_SECRET=random-long-secret-string-untuk-verifikasi-vercel-cron
PUBSUB_VERIFICATION_TOKEN=random-token-untuk-verifikasi-pubsub-push

# ── App Config ────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://canva-otp-relay.vercel.app
OTP_EXPIRY_MINUTES=10
```

### 6.2 Panduan Keamanan (Wajib Diikuti)

1. **`.gitignore` — pastikan baris berikut ada** sejak commit pertama:
   ```gitignore
   .env
   .env.local
   .env*.local
   *.pem
   service-account*.json
   ```
2. **Jangan pernah hardcode credentials** langsung di source code — semua rahasia hanya lewat `process.env.*`.
3. **Gunakan Vercel Environment Variables** (Project Settings → Environment Variables) untuk production/staging — jangan pernah commit `.env.production` ke repo, sekalipun private.
4. **Scope Gmail API seminimal mungkin**: gunakan scope `https://www.googleapis.com/auth/gmail.readonly` saja — **jangan** minta scope `gmail.modify` atau `gmail.compose` karena aplikasi ini tidak pernah perlu mengirim/mengubah email.
5. **Service Role Key Supabase** hanya boleh dipakai di server-side code (API routes), **tidak boleh** pernah ter-expose ke client bundle. Pastikan variable ini **tidak** memakai prefix `NEXT_PUBLIC_`.
6. **Verifikasi webhook Pub/Sub**: validasi bahwa request POST ke `/api/webhooks/gmail` benar-benar berasal dari Google, dengan memverifikasi JWT `Authorization: Bearer` header menggunakan Google's public certs, atau minimal cek `PUBSUB_VERIFICATION_TOKEN` sebagai query param rahasia saat setup subscription.
7. **Verifikasi cron secret**: endpoint `/api/cron/fetch-otp` harus menolak request yang tidak membawa header `Authorization: Bearer ${CRON_SECRET}` yang cocok (lihat kode di bagian 4.4).
8. **Rotasi token**: refresh token Google & Supabase service key sebaiknya dirotasi secara berkala (mis. tiap 6 bulan) atau segera jika ada anggota tim developer yang keluar.
9. **Private GitHub Repo wajib**, dan batasi akses hanya untuk anggota tim developer yang aktif — bukan seluruh tim pengguna dashboard.
10. **Data minimization**: jangan menyimpan seluruh isi body email ke database — cukup simpan `subject` (untuk debug) dan kode hasil ekstraksi. Ini mengurangi risiko jika database bocor.
11. **Least privilege OAuth**: jika memakai OAuth2 user consent (bukan service account), buat OAuth Consent Screen dalam mode **Internal** (jika pakai Google Workspace) atau **Testing** dengan daftar test user terbatas — jangan publish ke Production/External tanpa alasan kuat, supaya tidak butuh proses verifikasi sensitive scope dari Google yang panjang.

---

## 7. Step-by-Step Implementation Roadmap

### Milestone 1 — Setup Google Cloud Console & Gmail API
- [ ] Buat project baru di [Google Cloud Console](https://console.cloud.google.com), mis. `canva-otp-relay`.
- [ ] Aktifkan **Gmail API** dari API Library.
- [ ] Aktifkan **Cloud Pub/Sub API** (untuk push notification real-time).
- [ ] Buat topic Pub/Sub, mis. `gmail-notifications`, dan buat push subscription yang mengarah ke `https://<domain-vercel>/api/webhooks/gmail`.
- [ ] Beri izin `gmail-api-push@system.gserviceaccount.com` sebagai Publisher di topic tersebut (langkah wajib dari dokumentasi Gmail push notification).
- [ ] Buat OAuth 2.0 Client ID (tipe: Web application) di **Credentials**, atau siapkan Service Account jika mailbox tim berada di Google Workspace (memungkinkan domain-wide delegation tanpa perlu refresh token manual).
- [ ] Generate `refresh_token` awal melalui OAuth Playground / script one-time consent flow, dengan scope `gmail.readonly`.
- [ ] Simpan seluruh kredensial ke `.env.local`.

### Milestone 2 — Setup Database & Next.js Project
- [ ] Inisialisasi project: `npx create-next-app@latest canva-otp-relay --typescript --tailwind --app`.
- [ ] Install dependencies inti:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr googleapis date-fns sonner
  npx shadcn@latest init
  npx shadcn@latest add card button badge progress
  ```
- [ ] Buat project baru di [Supabase Dashboard](https://supabase.com/dashboard).
- [ ] Jalankan SQL migration dari Bagian 3 (tabel `otp_logs`, `allowed_users`, RLS policy) via Supabase SQL Editor.
- [ ] Setup Supabase Auth provider **Google OAuth** (Authentication → Providers → Google), masukkan Client ID/Secret dari Milestone 1.
- [ ] Isi manual data awal ke tabel `allowed_users` dengan email-email tim yang berhak akses.

### Milestone 3 — Backend Logic (Email Parsing & Regex)
- [ ] Implementasikan `src/lib/gmail.ts` (Gmail API client factory, auto-refresh token).
- [ ] Implementasikan `src/lib/otp-extractor.ts` (regex extraction — Bagian 4.3).
- [ ] Implementasikan `src/lib/supabase-admin.ts` (server-side client dengan Service Role Key).
- [ ] Implementasikan endpoint `/api/webhooks/gmail/route.ts` (Bagian 4.2).
- [ ] Implementasikan endpoint `/api/cron/fetch-otp/route.ts` (Bagian 4.4).
- [ ] Tulis unit test untuk `extractOtpFromEmail()` dengan beberapa contoh sample email Canva asli (gunakan fixture, bukan data real).
- [ ] Test manual: kirim OTP request dari akun Canva ke mailbox tim, verifikasi email berhasil ter-capture dan masuk ke tabel `otp_logs` tanpa duplikat.

### Milestone 4 — Frontend UI (shadcn/ui & Realtime Updates)
- [ ] Buat halaman `/login` dengan tombol Google Sign-In (Supabase Auth UI atau custom button).
- [ ] Buat halaman `/unauthorized`.
- [ ] Buat `middleware.ts` untuk proteksi route (Bagian 5.3).
- [ ] Bangun komponen `OtpCard` (Bagian 5.2.A) dan `OtpHistory` (Bagian 5.2.B).
- [ ] Implementasikan hook `useOtpRealtime` (Bagian 5.2.C) dan hubungkan ke Supabase Realtime channel.
- [ ] Susun halaman `/dashboard` yang menggabungkan initial server-side fetch (untuk SSR cepat) + realtime subscription (untuk update live).
- [ ] Uji responsivitas UI di mobile (banyak anggota tim kemungkinan membuka dashboard dari HP).

### Milestone 5 — Deployment & Vercel Cron Setup
- [ ] Push project ke **GitHub Private Repository**.
- [ ] Hubungkan repo ke **Vercel**, import project.
- [ ] Masukkan seluruh environment variables (Bagian 6.1) ke Vercel Project Settings — pisahkan value untuk Production/Preview jika perlu.
- [ ] Tambahkan file `vercel.json` dengan konfigurasi cron (Bagian 4.4).
- [ ] Update Pub/Sub push subscription endpoint URL ke domain production Vercel (`https://<domain>.vercel.app/api/webhooks/gmail`).
- [ ] Deploy, lalu lakukan **end-to-end test**: request OTP dari Canva → cek dashboard live terupdate dalam hitungan detik.
- [ ] Setup domain custom (opsional) dan aktifkan Vercel Analytics/Logs untuk monitoring endpoint webhook & cron.
- [ ] Dokumentasikan proses "menambah anggota tim baru" (cukup insert email baru ke tabel `allowed_users`) untuk operasional harian.

---

## 8. Appendix

### 8.1 Konvensi Penamaan File

| Jenis | Konvensi | Contoh |
|---|---|---|
| Komponen React | PascalCase file, kebab-case folder | `otp-card.tsx` mengekspor `OtpCard` |
| API Route Handler | selalu `route.ts` di dalam folder route | `app/api/cron/fetch-otp/route.ts` |
| Lib/utility | kebab-case | `lib/otp-extractor.ts` |
| Types | kebab-case, singular | `types/otp.ts` |
| SQL migration | timestamp prefix | `supabase/migrations/20260806_create_otp_logs.sql` |

### 8.2 Package Dependencies Utama

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "typescript": "^5.5.0",
    "tailwindcss": "^3.4.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "googleapis": "^144.0.0",
    "date-fns": "^3.6.0",
    "sonner": "^1.5.0",
    "lucide-react": "^0.400.0"
  }
}
```

### 8.3 Definition of Done (DoD) Proyek

Proyek dianggap selesai (v1.0) ketika:
1. Kode OTP dari email Canva baru muncul di dashboard dalam **< 10 detik** sejak email diterima (via webhook).
2. Tidak ada duplikat entry di `otp_logs` meski webhook & cron berjalan bersamaan (diverifikasi via test 2 jalur sekaligus).
3. User yang tidak ada di whitelist **tidak bisa** mengakses `/dashboard` (redirect ke `/unauthorized`).
4. Countdown expired berjalan akurat dan card otomatis redup setelah 10 menit tanpa perlu refresh halaman.
5. Semua credentials tervalidasi tidak ter-commit ke Git history (`git log -p | grep -i "GOOGLE_CLIENT_SECRET"` dan sejenisnya menghasilkan nihil).

---

*Akhir dokumen — PRD.md siap dipakai sebagai acuan development tim.*
