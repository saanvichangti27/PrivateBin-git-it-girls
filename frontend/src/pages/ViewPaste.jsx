import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPaste, reportFailure } from '../lib/api';
import { decryptFull } from '../lib/crypto';
import { Key, Lock, Unlock, AlertTriangle, ShieldCheck, Copy, Check, File, Download } from 'lucide-react';

export default function ViewPaste() {
  const { id } = useParams();

  const [encryptedData, setEncryptedData] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [accessCode, setAccessCode] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const [decryptedSecret, setDecryptedSecret] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch the encrypted data from the API on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getPaste(id);
        setEncryptedData(data);
      } catch (err) {
        setFetchError(err.message || 'Secret not found or expired.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleDecrypt = async (e) => {
    e.preventDefault();
    if (!accessCode.trim() || !encryptedData) return;

    setIsDecrypting(true);
    setDecryptError('');

    try {
      const plaintext = await decryptFull(
        encryptedData.ciphertext,
        encryptedData.iv,
        encryptedData.salt,
        accessCode.trim().toUpperCase()
      );
      setDecryptedSecret(plaintext);
    } catch (err) {
      console.error(err);
      try {
        const report = await reportFailure(id);
        if (report.burned) {
          setFetchError(report.message || 'Paste burned permanently due to excessive failed decryption attempts.');
          setEncryptedData(null); // Clear data so it shows the error view
        } else if (report.locked) {
          setFetchError(report.message || 'Paste locked temporarily due to excessive failed decryption attempts.');
          setEncryptedData(null);
        } else {
          setDecryptError(`Incorrect access code. ${report.attempts_remaining} attempts remaining.`);
        }
      } catch (reportErr) {
        console.error("Failed to report failure", reportErr);
        setDecryptError('Incorrect access code or corrupted data.');
      }
    } finally {
      setIsDecrypting(false);
    }
  };

  const copySecret = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-pulse text-custom-textSecondary font-medium">Loading secure payload...</div>
      </div>
    );
  }

  // Handle Fetch Errors (Expired, Not Found, View Limit, Locked)
  if (fetchError) {
    return (
      <div className="bg-custom-card border border-custom-border rounded-xl p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-custom-destructive/10 text-custom-destructive rounded-full mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-custom-textPrimary mb-2">Secret Unavailable</h2>
        <p className="text-custom-textSecondary mb-8">{fetchError}</p>
        <Link to="/" className="text-custom-accent hover:text-custom-accent font-medium transition-colors">
          Create a new secret &rarr;
        </Link>
      </div>
    );
  }

  // Try to parse decrypted payload as JSON
  let decryptedPayload = null;
  try {
    if (decryptedSecret) {
      decryptedPayload = JSON.parse(decryptedSecret);
    }
  } catch (err) {
    // Falls back to string representation (older/legacy pastes)
    decryptedPayload = { text: decryptedSecret, files: null };
  }

  // Normalize single file and multiple files to a single array
  let files = [];
  if (decryptedPayload) {
    if (Array.isArray(decryptedPayload.files)) {
      files = decryptedPayload.files;
    } else if (decryptedPayload.file) {
      files = [decryptedPayload.file];
    }
  }

  // Successfully Decrypted View
  if (decryptedSecret) {
    const textToShow = decryptedPayload ? decryptedPayload.text : decryptedSecret;

    return (
      <div className="space-y-6 max-w-4xl w-full">
        <div className="bg-custom-card border border-emerald-900/50 rounded-xl overflow-hidden shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-custom-bg px-6 py-4 border-b border-custom-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-custom-accent">
              <ShieldCheck size={18} />
              <span className="font-semibold text-sm tracking-wide uppercase">Decrypted Secret</span>
            </div>
            {textToShow && (
              <button 
                onClick={() => copySecret(textToShow)}
                className="flex items-center gap-1.5 text-xs font-medium text-custom-textSecondary hover:text-custom-textPrimary transition-colors"
              >
                {copied ? <Check size={14} className="text-custom-accent"/> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {textToShow ? (
            <div className="p-6">
              <pre className="font-sans whitespace-pre-wrap text-custom-textPrimary text-base leading-relaxed">
                {textToShow}
              </pre>
            </div>
          ) : (
            <div className="p-6 text-custom-textSecondary italic text-center text-sm">
              No text message attached.
            </div>
          )}
        </div>

        {/* Attached Decrypted Files */}
        {files.length > 0 && (
          <div className="bg-custom-card border border-custom-border rounded-xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            <h3 className="text-sm font-semibold text-custom-textSecondary uppercase tracking-wider">
              Attached Secure Files ({files.length})
            </h3>
            
            <div className="space-y-6">
              {files.map((file, idx) => (
                <div key={idx} className="space-y-4 border-b border-custom-border last:border-b-0 pb-6 last:pb-0">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-custom-bg border border-custom-border rounded-lg p-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-3 bg-custom-accent/10 text-custom-accent rounded-md">
                        <File size={24} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold text-custom-textPrimary truncate">{file.name}</p>
                        <p className="text-xs text-custom-textSecondary">
                          {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Unknown Type'}
                        </p>
                      </div>
                    </div>
                    
                    <a
                      href={file.data}
                      download={file.name}
                      className="flex items-center justify-center gap-2 bg-custom-accent hover:bg-custom-accent text-custom-textPrimary font-semibold py-2 px-4 rounded-lg transition-colors text-sm w-full md:w-auto cursor-pointer"
                    >
                      <Download size={16} />
                      Download File
                    </a>
                  </div>

                  {/* Render Preview if Image */}
                  {file.type && file.type.startsWith('image/') && (
                    <div className="border border-custom-border rounded-lg overflow-hidden bg-custom-bg p-2 flex justify-center">
                      <img
                        src={file.data}
                        alt={file.name}
                        className="max-h-96 object-contain rounded-md"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Awaiting Decryption Code View
  return (
    <div className="bg-custom-card border border-custom-border rounded-xl p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-custom-warning/10 text-custom-warning rounded-full mb-4">
          <Lock size={24} />
        </div>
        <h2 className="text-2xl font-bold text-custom-textPrimary mb-2">Encrypted Payload Found</h2>
        <p className="text-custom-textSecondary text-sm">
          Enter the access code provided by the sender to decrypt this secret locally.
        </p>
      </div>

      <form onSubmit={handleDecrypt} className="space-y-6 max-w-sm mx-auto">
        <div>
          <label className="block text-sm font-medium text-custom-textSecondary mb-2 text-center">
            Access Code
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-custom-textSecondary">
              <Key size={18} />
            </div>
            <input
              type="text"
              autoFocus
              required
              className={`w-full bg-custom-bg border ${decryptError ? 'border-custom-destructive/50 focus:ring-custom-destructive/50' : 'border-custom-border focus:ring-custom-accent/50 focus:border-custom-accent'} rounded-lg pl-10 pr-4 py-3 text-center font-mono font-bold text-xl tracking-widest text-custom-textPrimary placeholder-custom-textSecondary focus:outline-none focus:ring-2 uppercase transition-all`}
              placeholder="e.g. K7X9QPMN"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setDecryptError(''); // Clear error on type
              }}
            />
          </div>
          {decryptError && (
            <p className="text-custom-destructive text-sm text-center mt-3 animate-pulse">
              {decryptError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isDecrypting || !accessCode.trim()}
          className="w-full flex items-center justify-center gap-2 bg-custom-accent hover:bg-custom-accent disabled:bg-custom-disabled disabled:cursor-not-allowed text-custom-textPrimary font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          <Unlock size={18} />
          {isDecrypting ? 'Decrypting...' : 'Decrypt Secret'}
        </button>
      </form>
    </div>
  );
}
