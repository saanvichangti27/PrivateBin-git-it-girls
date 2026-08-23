# CloneFest 2.0 — Task 1: Legacy Modernisation (PrivateBin)
### Project Brief & Context Handoff Document (Updated)

> Purpose of this document: full context dump of the event, the task, and current project
> ideas/decisions, so any AI agent or teammate picking this up has everything needed
> without re-deriving it. Items marked **[PROPOSED / UNVERIFIED]** are reasoning or
> suggestions, not settled facts or documented specs — verify before treating as final.
> Items marked **[DECIDED]** are settled by the team as of this update.

---

## 1. Event Overview

**Event:** CloneFest 2.0
**Format:** Team-based hackathon. Teams take on real-world engineering challenges across two tracks:
- Legacy Modernisation
- Developer Tool Reconstruction

**Goal:** Recreate, modernise, and engineer solutions from challenging existing codebases, and build impactful open-source solutions from the ground up.

---

## 2. Judging Rubric (100 marks total)

| # | Criterion | Marks |
|---|-----------|-------|
| 1 | Problem Understanding & Core Functionality | 20 |
| 2 | Innovation & Meaningful Differentiation | 20 |
| 3 | Technical Implementation & Architecture | 15 |
| 4 | User Experience & Accessibility | 15 |
| 5 | Performance & Reliability / Demo Quality | 20 |
| 6 | Documentation & Explanation | 10 |
| **Total** | | **100** |

**Implication for our project:** 40 of the 100 marks (Problem Understanding + Innovation) hinge on us clearly demonstrating we understood *why* PrivateBin works the way it does, and that our changes are genuine, well-reasoned improvements — not cosmetic changes or accidental security regressions.

---

## 3. Our Task: Legacy Modernisation — PrivateBin

**Official problem description:**
Build a modern, secure, and user-friendly platform for sharing sensitive text and information online, inspired by the core problem PrivateBin addresses.

**Explicit constraints from the task doc:**
- The goal is **NOT** to replicate PrivateBin or reproduce its existing UI/UX.
- We are expected to understand the *underlying problem* and build our **own modern interpretation** using a contemporary tech stack.
- Must cover the essential capabilities for secure, controlled information sharing.
- Freedom to rethink: UX, architecture, security model, collaboration features, usability, performance.
- We may clone/reference the repo to understand internals, but the final solution must show independent implementation and meaningful innovation.

**Reference repo:** https://github.com/PrivateBin/PrivateBin

**One-line framing:** Understand the problem → preserve the essential purpose → build our own modern solution → innovate beyond the reference.

---

## 4. Reference System Summary — How PrivateBin Actually Works

(From the repo's own README/SECURITY docs — included so any agent has ground truth to compare our design against.)

- PrivateBin is a **zero-knowledge pastebin**: the server never has access to unencrypted data.
- Encryption/decryption happens **entirely in the browser**, using 256-bit AES in **Galois Counter Mode (GCM)**.
- The decryption key lives in the **URL fragment** (the part after `#`). Browsers never send the URL fragment to the server — this is *the* mechanism that makes "zero knowledge" true.
- Optional password protection: combined client-side with the fragment key to derive the actual encryption key. The server never learns the password.
- Other existing features: discussion/comments, expiration times (including "burn after reading"), Markdown support, syntax highlighting, file upload, templates, translations, QR codes.
- Stated limitations: admins must be trusted (HTTPS + HSTS mandatory); an unprotected link's full URL exposes the paste to anyone who has it; access logs can still be subpoenaed; a compromised server could theoretically serve malicious JS to exfiltrate a key on future access.

**Key takeaway for our design:** the "zero-knowledge" guarantee rests entirely on the server never receiving the decryption secret. Our redesign must preserve this explicitly, or we must be honest in our docs about the trade-off.

---

## 5. Team & Task Split **[DECIDED]**

| Person | Responsibility |
|---|---|
| Person 1 | Crypto & hashing (`crypto.js` — already implemented) |
| Person 2 | Backend — FastAPI + database |
| Person 3 | Frontend — React + Vite |
| Person 4 | CSP / SRI security headers |

This is the core-structure split. Rate limiting, geo-detection, dashboard, etc. are later additions once MVP works.

---

## 6. Core Architecture Decisions **[DECIDED]**

### 6.1 Tech Stack
- Frontend: **React + Vite**
- Backend: **FastAPI**
- Database: **Redis**
- Repo structure: **Monorepo** (`/frontend`, `/backend`)
- Crypto: WebCrypto API, via `crypto.js` (Person 1's existing implementation)

### 6.2 Link / Key Delivery Model — supersedes PrivateBin's fragment-key model
- `crypto.js` derives the AES-GCM key directly from `accessCode + salt` via PBKDF2 — **there is no fragment key at all**.
- The shareable link encodes **only the paste ID**: `https://yourapp.com/paste/{id}`.
- The **access code is shared separately, entirely out of band** (chat, call, etc.) — never appears in the URL, never sent to the server.
- The **salt is not secret** — it must be stored server-side and returned with the ciphertext, since the client needs it to re-derive the key.
- This resolves the Open Question from the previous version of this doc ("does the access code replace or supplement the fragment key?") — it **fully replaces** it. Zero-knowledge is preserved because the access code itself is never transmitted; only the (non-secret) salt and ciphertext travel through the server.

### 6.3 API Contract (see also `API_CONTRACT.md`)

```
POST /paste
  body:  { "ciphertext": str, "iv": str, "salt": str, "ttl": int, "max_views": int|null, "burn_threshold": int }
  resp:  { "id": str, "expires_at": str, "remaining_views": int|null, "burn_threshold": int }              (201 Created)

GET /paste/{id}
  resp:  { "id": str, "ciphertext": str, "iv": str, "salt": str, "remaining_views": int, "expires_at": str }   (200 OK)
  404 if not found (or expired/burned)

POST /paste/{id}/report-failure
  resp:  { "burned": bool, "attempts_remaining": int, "message": str } (200 OK)
```

Error format: `{ "error": "message" }`

### 6.4 Database Schema (Redis JSON)

We use Redis instead of SQLite. The keys are formatted as `paste:{id}`.

```json
{
  "ciphertext": "base64",
  "iv": "base64",
  "salt": "base64",
  "burn_threshold": 5,
  "failed_attempts": 0,
  "max_views": null,
  "views": 0,
  "expires_at": "timestamp"
}
```

Redis automatically handles the expiration using its native `EXPIRE` command.

### 6.5 Paste ID Generation **[DECIDED]**
- Backend generates the ID at insert time (not the client) — keeps ID generation and DB write atomic.
- Method: short URL-safe random token (e.g. Python's `secrets.token_urlsafe()` or equivalent — verify exact syntax in current docs), not a full UUID. Chosen for a cleaner, shorter shareable link.
- Backend should check for ID collisions on insert and retry if one occurs — very unlikely at this scale, but cheap to guard against.

### 6.6 CORS
FastAPI must allow the Vite dev server origin in dev, and the real deployed frontend origin in prod. Confirmed, not yet implemented.

---

## 7. Security Features (CSP / SRI) — Person 4

**Decision:** Include both as core security features.

- Since encryption/decryption happens client-side in JS, **XSS is the primary threat** — a script injection can steal plaintext or the access code before/after encryption, with no server-side trace.
- **CSP** is implemented via a strict `<meta>` tag injected into `index.html`. It explicitly restricts script, style, and connect origins to mitigate XSS risks, while allowing Vite's development HMR to run locally.
- **SRI** is fully implemented. We installed a Vite plugin (`vite-plugin-sri`) that automatically generates cryptographic hashes (`integrity="..."`) for all JavaScript and CSS files during the `npm run build` process, protecting against external tampering.

---

## 8. Post-MVP Features (Partially Implemented)

We have successfully implemented several "future" features in the current build:
- **Implemented:** Configurable link expiration (via Redis TTL).
- **Implemented:** Max-views / burn-after-reading.
- **Implemented:** Suspicious activity detection (failed attempts now trigger a burn threshold via the `/report-failure` endpoint).

Still remaining to be built:
- Security dashboard (access count, timestamps, history)
- Advanced IP-based rate limiting / auto-block

*(Note: The server-side hash verification of access-code attempts proposed earlier was replaced with a much simpler frontend-reported `report-failure` endpoint that doesn't require any cryptography changes.)*

---

## 9. Remaining Open Questions

1. Deployment target/hosting — not decided.
2. How the access code is delivered to the recipient in practice (verbally, messaging app, QR code) — assumed out-of-band, exact UX not designed yet.
3. Definition of "suspicious" geographic access pattern — deferred to post-MVP, needs a concrete definition later for Documentation & Explanation marks.

---

## 10. Notes for Whoever Picks This Up

- Section 6.2's key-delivery model is now the settled design — the earlier "fragment vs access-code" open question is resolved: full replacement, no fragment key.
- Section 8's hash-verification approach is still unreviewed reasoning, not implemented — don't treat it as done.
- Section 4 is drawn from PrivateBin's own README/SECURITY files — reliable as ground truth for the *reference* system only.
- Companion document: `API_CONTRACT.md` (full route/schema spec).
