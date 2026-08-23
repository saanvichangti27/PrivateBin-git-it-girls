import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPaste, reportFailure } from '../lib/api';
import { decryptFull } from '../lib/crypto';
import { Key, Lock, Unlock, AlertTriangle, ShieldCheck, Copy, Check } from 'lucide-react';

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

  const copySecret = () => {
    navigator.clipboard.writeText(decryptedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-pulse text-zinc-500 font-medium">Loading secure payload...</div>
      </div>
    );
  }

  // Handle Fetch Errors (Expired, Not Found, View Limit)
  if (fetchError) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 text-red-400 rounded-full mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Secret Unavailable</h2>
        <p className="text-zinc-400 mb-8">{fetchError}</p>
        <Link to="/" className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors">
          Create a new secret &rarr;
        </Link>
      </div>
    );
  }

  // Successfully Decrypted View
  if (decryptedSecret) {
    return (
      <div className="bg-zinc-900 border border-emerald-900/50 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-zinc-950/50 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck size={18} />
            <span className="font-semibold text-sm tracking-wide uppercase">Decrypted Secret</span>
          </div>
          <button 
            onClick={copySecret}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="p-6">
          <pre className="font-sans whitespace-pre-wrap text-zinc-200 text-base leading-relaxed">
            {decryptedSecret}
          </pre>
        </div>
      </div>
    );
  }

  // Awaiting Decryption Code View
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full mb-4">
          <Lock size={24} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Encrypted Payload Found</h2>
        <p className="text-zinc-400 text-sm">
          Enter the access code provided by the sender to decrypt this secret locally.
        </p>
      </div>

      <form onSubmit={handleDecrypt} className="space-y-6 max-w-sm mx-auto">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2 text-center">
            Access Code
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
              <Key size={18} />
            </div>
            <input
              type="text"
              autoFocus
              required
              className={`w-full bg-zinc-950 border ${decryptError ? 'border-red-500/50 focus:ring-red-500/50' : 'border-zinc-800 focus:ring-emerald-500/50 focus:border-emerald-500'} rounded-lg pl-10 pr-4 py-3 text-center font-mono font-bold text-xl tracking-widest text-zinc-100 placeholder-zinc-700 focus:outline-none focus:ring-2 uppercase transition-all`}
              placeholder="e.g. K7X9QPMN"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setDecryptError(''); // Clear error on type
              }}
            />
          </div>
          {decryptError && (
            <p className="text-red-400 text-sm text-center mt-3 animate-pulse">
              {decryptError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isDecrypting || !accessCode.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          <Unlock size={18} />
          {isDecrypting ? 'Decrypting...' : 'Decrypt Secret'}
        </button>
      </form>
    </div>
  );
}
