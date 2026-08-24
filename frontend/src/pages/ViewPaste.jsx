import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPaste, reportFailure } from '../lib/api';
import { decryptFull } from '../lib/crypto';
import { Key, Lock, Unlock, AlertTriangle, ShieldCheck, ShieldAlert, Copy, Check, Flame, Clock } from 'lucide-react';

export default function ViewPaste() {
  const { id } = useParams();

  const [encryptedData, setEncryptedData] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [accessCode, setAccessCode] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const [decryptedSecret, setDecryptedSecret] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch encrypted data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getPaste(id);
        setEncryptedData(data);
      } catch (err) {
        if (err.status === 423 || err.message?.toLowerCase().includes('locked')) {
          setIsLocked(true);
          setFetchError(err.message || 'This secret has been temporarily locked due to suspicious activity.');
        } else {
          setFetchError(err.message || 'Secret not found or expired.');
        }
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
          setEncryptedData(null);
        } else {
          setDecryptError(`Incorrect access code. ${report.attempts_remaining} attempts remaining before auto-burn.`);
        }
      } catch (reportErr) {
        console.error('Failed to report failure', reportErr);
        setDecryptError('Incorrect access code or corrupted payload.');
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
        <div className="animate-pulse text-zinc-500 font-medium">Retrieving secure encrypted payload...</div>
      </div>
    );
  }

  // Locked State View
  if (isLocked) {
    return (
      <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-8 shadow-2xl text-center max-w-md mx-auto animate-in fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full mb-6">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Secret Temporarily Locked</h2>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          {fetchError || 'This secret link has been locked due to suspicious activity or by the creator. Please contact the sender to unlock it.'}
        </p>
        <Link to="/" className="inline-block text-emerald-500 hover:text-emerald-400 font-medium text-sm transition-colors">
          &larr; Create a new secret
        </Link>
      </div>
    );
  }

  // Fetch Errors (Expired, Burned, Not Found)
  if (fetchError) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl text-center max-w-md mx-auto animate-in fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 text-red-400 rounded-full mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Secret Unavailable</h2>
        <p className="text-zinc-400 text-sm mb-6">{fetchError}</p>
        <Link to="/" className="inline-block text-emerald-500 hover:text-emerald-400 font-medium text-sm transition-colors">
          Create a new secret &rarr;
        </Link>
      </div>
    );
  }

  // Successfully Decrypted View
  if (decryptedSecret) {
    const isBurned = encryptedData?.remaining_views === 0;

    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {isBurned && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-2.5 rounded-lg">
            <Flame size={16} className="text-rose-400 shrink-0" />
            <span>
              <strong>Burned on Read:</strong> This was the final allowed view. The ciphertext has been permanently erased from the server.
            </span>
          </div>
        )}

        <div className="bg-zinc-900 border border-emerald-900/50 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-zinc-950/70 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck size={18} />
              <span className="font-semibold text-xs tracking-wide uppercase">Decrypted Secret Content</span>
            </div>
            <button
              onClick={copySecret}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-md"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy Secret'}
            </button>
          </div>
          <div className="p-6">
            <pre className="font-mono whitespace-pre-wrap text-zinc-100 text-sm leading-relaxed select-all">
              {decryptedSecret}
            </pre>
          </div>
        </div>

        <div className="text-center pt-2">
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            &larr; Create your own encrypted secret
          </Link>
        </div>
      </div>
    );
  }

  // Awaiting Decryption Code View
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full mb-4">
          <Lock size={24} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Encrypted Payload Found</h2>
        <p className="text-zinc-400 text-sm">
          Enter the access code provided by the sender to decrypt this secret locally in your browser.
        </p>
      </div>

      <form onSubmit={handleDecrypt} className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 text-center">
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
              className={`w-full bg-zinc-950 border ${
                decryptError ? 'border-red-500/50 focus:ring-red-500/50' : 'border-zinc-800 focus:ring-emerald-500/50 focus:border-emerald-500'
              } rounded-lg pl-10 pr-4 py-3 text-center font-mono font-bold text-xl tracking-widest text-zinc-100 placeholder-zinc-700 focus:outline-none focus:ring-2 uppercase transition-all`}
              placeholder="e.g. K7X9QPMN"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setDecryptError('');
              }}
            />
          </div>
          {decryptError && (
            <p className="text-red-400 text-xs text-center mt-3 animate-pulse">
              {decryptError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isDecrypting || !accessCode.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
        >
          <Unlock size={18} />
          {isDecrypting ? 'Decrypting...' : 'Decrypt Secret'}
        </button>
      </form>
    </div>
  );
}
