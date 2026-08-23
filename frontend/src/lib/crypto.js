/**
 * Secure Client-Side Cryptography Module for Secret Sharing.
 * Utilizes the native browser WebCrypto API (crypto.subtle).
 */

/**
 * Converts an ArrayBuffer or TypedArray to a base64 string.
 *
 * @param {ArrayBuffer | TypedArray} buffer - The buffer to convert.
 * @returns {string} The base64-encoded string.
 */
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to an ArrayBuffer.
 *
 * @param {string} base64 - The base64-encoded string.
 * @returns {ArrayBuffer} The decoded ArrayBuffer.
 */
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a random, human-readable access code (8 characters).
 * Uses uppercase letters and digits, avoiding ambiguous characters (0, O, 1, I).
 *
 * @returns {Promise<string>} The generated access code.
 */
export async function generateAccessCode() {
  // 32-character alphabet omitting 0, O, 1, I
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);

  let code = '';
  for (let i = 0; i < 8; i++) {
    // 32 divides 256 perfectly (256 % 32 = 0), preventing modulo bias
    code += charset[randomBytes[i] % 32];
  }
  return code;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from an access code and salt using PBKDF2.
 *
 * @param {string} accessCode - The human-readable access code.
 * @param {Uint8Array} [salt] - The salt to use. If not provided, a random 16-byte salt is generated.
 * @returns {Promise<{key: CryptoKey, salt: Uint8Array}>} The derived key and the salt used.
 */
export async function deriveKeyFromCode(accessCode, salt) {
  if (!accessCode || typeof accessCode !== 'string') {
    throw new Error('Access code must be a non-empty string');
  }

  // Use a 16-byte random salt if none is provided
  let usedSalt = salt;
  if (!usedSalt) {
    usedSalt = new Uint8Array(16);
    crypto.getRandomValues(usedSalt);
  } else if (!(usedSalt instanceof Uint8Array)) {
    throw new Error('Salt must be a Uint8Array');
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(accessCode);

  // Import access code string as a raw base key for PBKDF2 derivation
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive the 256-bit AES-GCM key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: usedSalt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // Key material remains non-extractable from JS space for security
    ['encrypt', 'decrypt']
  );

  return { key, salt: usedSalt };
}

/**
 * Encrypts a plaintext string using AES-GCM and a CryptoKey.
 *
 * @param {string} plaintext - The plaintext string to encrypt.
 * @param {CryptoKey} key - The AES-GCM CryptoKey.
 * @returns {Promise<{iv: string, ciphertext: string}>} Object containing the base64-encoded IV and ciphertext.
 */
export async function encryptSecret(plaintext, key) {
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a string');
  }
  if (!(key instanceof CryptoKey)) {
    throw new Error('Key must be a valid CryptoKey');
  }

  // AES-GCM standard IV length is 12 bytes (96 bits)
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    plaintextBuffer
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer)
  };
}

/**
 * Decrypts a base64-encoded AES-GCM ciphertext using the provided IV and CryptoKey.
 *
 * @param {string} ciphertextBase64 - The base64-encoded ciphertext.
 * @param {string} ivBase64 - The base64-encoded IV.
 * @param {CryptoKey} key - The AES-GCM CryptoKey.
 * @returns {Promise<string>} The decrypted plaintext string.
 * @throws {Error} Clear, catchable error if decryption or integrity validation fails.
 */
export async function decryptSecret(ciphertextBase64, ivBase64, key) {
  if (typeof ciphertextBase64 !== 'string' || typeof ivBase64 !== 'string') {
    throw new Error('Ciphertext and IV must be base64 strings');
  }
  if (!(key instanceof CryptoKey)) {
    throw new Error('Key must be a valid CryptoKey');
  }

  let iv;
  let ciphertext;
  try {
    iv = new Uint8Array(base64ToBuffer(ivBase64));
    ciphertext = base64ToBuffer(ciphertextBase64);
  } catch (err) {
    throw new Error('Decryption failed: Invalid base64 encoding', { cause: err });
  }

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    // AES-GCM decryption throws an OperationError if decryption or tag check fails
    throw new Error('Decryption failed: Invalid key, wrong access code, or corrupted data', { cause: err });
  }
}

/**
 * Convenience wrapper to encrypt plaintext using a newly generated salt and access code.
 *
 * @param {string} plaintext - The plaintext string to encrypt.
 * @param {string} accessCode - The access code to derive the key from.
 * @returns {Promise<{ciphertext: string, iv: string, salt: string}>} All base64-encoded parameters needed for later decryption.
 */
export async function encryptFull(plaintext, accessCode) {
  // Generate random salt (16 bytes is recommended for PBKDF2)
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // Derive key from the access code and salt
  const { key } = await deriveKeyFromCode(accessCode, salt);

  // Encrypt using AES-GCM
  const { iv, ciphertext } = await encryptSecret(plaintext, key);

  return {
    ciphertext,
    iv,
    salt: bufferToBase64(salt)
  };
}

/**
 * Convenience wrapper to decrypt ciphertext using a stored salt, IV, and access code.
 *
 * @param {string} ciphertextBase64 - The base64-encoded ciphertext.
 * @param {string} ivBase64 - The base64-encoded IV.
 * @param {string} saltBase64 - The base64-encoded salt.
 * @param {string} accessCode - The access code.
 * @returns {Promise<string>} The decrypted plaintext string.
 */
export async function decryptFull(ciphertextBase64, ivBase64, saltBase64, accessCode) {
  let salt;
  try {
    salt = new Uint8Array(base64ToBuffer(saltBase64));
  } catch (err) {
    throw new Error('Decryption failed: Invalid salt encoding', { cause: err });
  }

  // Derive the key from the access code and decoded salt
  const { key } = await deriveKeyFromCode(accessCode, salt);

  // Decrypt using AES-GCM
  return await decryptSecret(ciphertextBase64, ivBase64, key);
}

// Development Self-Test Block (runs automatically when imported/evaluated in development environments)
if (
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
  (typeof window !== 'undefined' && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1'))
) {
  (async () => {
    console.group('🧪 crypto.js Self-Tests');
    try {
      const originalText = 'This is a top secret message! 🤫🔑';

      // 1. Generate access code
      const code = await generateAccessCode();
      console.log('- Generated Access Code:', code);
      if (code.length !== 8) throw new Error('Access code length must be 8');
      if (/[01OI]/.test(code)) throw new Error('Access code contains ambiguous characters');

      // 2. Encrypt
      const encrypted = await encryptFull(originalText, code);
      console.log('- Encrypted parameters generated:', encrypted);

      // 3. Decrypt (Success path)
      const decrypted = await decryptFull(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.salt,
        code
      );

      if (decrypted === originalText) {
        console.log('✅ Success test passed: Round-trip decrypted matches original!');
      } else {
        throw new Error(`Success test failed: Decrypted text "${decrypted}" doesn't match original.`);
      }

      // 4. Decrypt with wrong code (Failure path)
      const wrongCode = code === 'A2345678' ? 'B2345678' : 'A2345678';
      try {
        await decryptFull(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          wrongCode
        );
        throw new Error('Failure test failed: Decryption succeeded with the WRONG access code!');
      } catch (err) {
        console.log('✅ Negative test passed: Decryption failed cleanly with wrong access code:', err.message);
      }

      console.log('🎉 All crypto.js tests completed successfully!');
    } catch (error) {
      console.error('❌ crypto.js self-test failure:', error);
    } finally {
      console.groupEnd();
    }
  })();
}
