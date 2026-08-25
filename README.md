# PrivateBin Modernized 🔐

A secure, zero-knowledge, and modern interpretation of PrivateBin built with a contemporary tech stack. This platform allows users to share sensitive text and files online with robust access controls, client-side encryption, and administrative insight.

Unlike standard PrivateBin, which stores decryption keys in the URL fragment, this project uses a separate out-of-band **Access Code** model. This prevents the server from ever seeing the decryption secrets, even in URL access logs.

---

## 🌟 Key Features

*   **Zero-Knowledge Client-Side Crypto:** Encryption/decryption is performed completely in the user's browser using the native WebCrypto API (AES-GCM 256-bit).
*   **Out-of-Band Key Delivery:** Shareable links contain only the paste ID. The access code must be shared separately out-of-band, rendering leaked URLs useless on their own.
*   **Time-to-Live (TTL) Expiration:** Define paste longevity (1 hour, 1 day,etc), powered by Redis's native TTL key expiration.
*   **Burn-After-Reading & View Limits:** Configure the maximum number of times a paste can be retrieved. The secret payload is automatically scrubbed once the view limit is reached.
*   **Brute-Force & Abuse Mitigation:**
    *   **Burn Threshold:** Automated paste locking if decryption failures (wrong access codes) exceed the user-defined threshold.
    *   **IP Blocklist Middleware:** Automatic 30-minute block list for client IPs with excessive failed attempts to prevent global scraping or scanning.
*   **Creator Analytics & Status Dashboard:** Track paste status  view counts, failed decryption attempts, and detailed GDPR-compliant access logs with anonymized IP hashes and approximate geo-location.
*   **Hybrid Storage Engine:** Utilizes Redis for high-performance atomic operations with an automatic, thread-safe in-memory fallback for local development if Redis is unavailable.
*   **Strict CSP:** Configured via custom HTTP headers and HTML `<meta>` tags. Script, style, and connect sources are strictly limited to prevent third-party asset injections and data exfiltration.
*   **Subresource Integrity (SRI):** Integrated via the `vite-plugin-sri` plugin. It automatically generates cryptographic hashes (`integrity="..."`) for built JavaScript assets and stylesheets, ensuring the browser refuses to load tampered resources.
---

## 🛠️ Tech Stack

*   **Frontend:** React (Vite) + Tailwind CSS
*   **Backend:** FastAPI (Python) + Uvicorn + SlowAPI (Rate-limiting) + HTTPX (IP lookup)
*   **Database:** Redis (JSON-document model)
*   **Crypto:** Browser-native WebCrypto API

---

## 📂 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── middleware/        # Starlette middlewares (IP blocklists, security)
│   │   ├── routes/            # FastAPI routers (paste, analytics, lock control)
│   │   ├── id_generator.py    # Random URL-safe paste ID generator
│   │   ├── main.py            # FastAPI main application & CORS setup
│   │   ├── redis_client.py    # Redis wrapper & in-memory fallback store
│   │   ├── schemas.py         # Pydantic data schemas
│   │   └── security.py        # IP hashing, log formatting, and blocklist logic
│   ├── requirements.txt       # Python dependencies
│   └── test_api.py            # API integration tests
│
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.js         # API client & request wrappers
│   │   │   └── crypto.js      # Browser WebCrypto AES-GCM & PBKDF2 implementation
│   │   ├── pages/
│   │   │   ├── CreatePaste.jsx # Paste creation form
│   │   │   ├── ViewPaste.jsx   # Client-side decryption and paste reader
│   │   │   └── Dashboard.jsx   # Creator statistics, analytics charts & access logs
│   │   ├── App.jsx            # React router and application layout
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js     # Tailwind setup
│   └── vite.config.js         # Vite configuration with CSP & SRI plugin hooks
```

---

## 🔐 Security & Cryptographic Model

The application strictly preserves the zero-knowledge security standard by using browser-based WebCrypto operations:

1.  **Key Derivation (PBKDF2):**
    The user-provided 8-character human-readable access code (avoiding ambiguous characters like `0`, `O`, `1`, `I`) is combined with a random client-generated 16-byte salt and stretched using PBKDF2 (100,000 iterations, SHA-256) to derive a 256-bit AES-GCM key.
2.  **Encryption (AES-256-GCM):**
    The plaintext is encrypted with the derived key and a unique 12-byte initialization vector (IV).
3.  **Transmission:**
    Only the `ciphertext`, `iv`, and `salt` (non-secret) are sent to the FastAPI backend. The server stores these fields in Redis.
4.  **Decryption:**
    When reading the paste, the recipient receives the `ciphertext`, `iv`, and `salt` from the API. The recipient inputs the out-of-band access code, and the key is re-derived to decrypt the payload entirely in-browser.

---

