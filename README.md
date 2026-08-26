# PrivateBin 🔐

A secure, zero-knowledge, and modern interpretation of PrivateBin built with a contemporary tech stack. This platform allows users to share sensitive text and files online with robust access controls, client-side encryption, and administrative insight.

Unlike standard PrivateBin, which stores decryption keys in the URL fragment, this project uses a separate out-of-band **Access Code** model. This prevents the server from ever seeing the decryption secrets, even in URL access logs.

(please note that the first time a link is getting created it takes some time to load the server, the next time onwards it becomes fast)

---

## 🌟 Key Features

* **Zero-Knowledge Architecture:** AES-256-GCM encryption happens completely client-side.
* **Out-of-Band Key Delivery:** Shareable links don't contain the password. Leaked URLs are useless on their own.
* **Self-Destruct & Time Limits:** Secrets automatically burn after a set number of views or a specific time limit.
* **Abuse Protection:** Secrets lock automatically after too many failed decryption attempts, and suspicious IPs are temporarily blocked to prevent brute-force attacks.
* **Security Dashboard:** Track real-time analytics, view counts, and failed attempts for the secrets you create.
* **Hardened Frontend:** Built with strict Content-Security-Policy (CSP) headers and Subresource Integrity (SRI) to prevent third-party tampering.

---

## 🔐 Security & Cryptographic Model

The application strictly preserves a zero-knowledge security standard by encrypting everything locally before it leaves your device:
1. **Key Derivation:** Your 8-character access code is salted and stretched (PBKDF2, 100k iterations) into a secure 256-bit AES-GCM key.
2. **Encryption:** The plaintext and files are encrypted entirely within your browser.
3. **Transmission & Decryption:** Only the encrypted ciphertext is sent to the server. To read the secret, the recipient must have the out-of-band access code to decrypt it locally. The server never sees your raw data.

---

## 🛠️ Tech Stack

*   **Frontend:** React (Vite) + Tailwind CSS
*   **Backend:** FastAPI (Python) + Uvicorn + SlowAPI
*   **Database:** Redis (JSON-document model)
*   **Crypto:** Browser-native WebCrypto API

---

## 📂 Project Structure

```
├── backend/
│   ├── app/               # FastAPI routes, middleware, and Redis integration
│   └── requirements.txt   # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── lib/           # API client & WebCrypto implementation
│   │   ├── pages/         # React views (Create, View, Dashboard)
│   │   └── App.jsx        # Routing and layout
│   └── vite.config.js     # Vite configuration
```

---

## 🎯 Conclusion

This project brings modern design to the concept of zero-knowledge secret sharing. Whether you are sharing API keys, passwords, or sensitive documents, this platform ensures your data remains fundamentally yours—Share What Matters. Privately.
