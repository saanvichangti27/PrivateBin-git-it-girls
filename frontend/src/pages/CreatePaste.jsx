import React, { useState } from 'react';
import { generateAccessCode, encryptFull } from '../lib/crypto';
import { createPaste } from '../lib/api';
import { Copy, Check, Lock, ExternalLink } from 'lucide-react';

export default function CreatePaste() {
  const [secret, setSecret] = useState('');
  const [maxViews, setMaxViews] = useState('0'); // 0 = unlimited
  const [expiresIn, setExpiresIn] = useState('0'); // 0 = never

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdData, setCreatedData] = useState(null); // { id, code, link }
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secret.trim()) return;

    setIsSubmitting(true);
    try {
      // 1. Generate access code
      const code = await generateAccessCode();

      // 2. Encrypt the secret locally
      const { ciphertext, iv, salt } = await encryptFull(secret, code);

      // 3. Send encrypted data to (mock) backend
      const { id } = await createPaste({
        ciphertext,
        iv,
        salt,
        maxViews: maxViews === '0' ? null : Number(maxViews),
        expiresInSeconds: expiresIn === '0' ? null : Number(expiresIn)
      });

      const link = `${window.location.origin}/view/${id}`;
      setCreatedData({ id, code, link });
    } catch (err) {
      console.error("Error creating paste:", err);
      alert("Something went wrong creating your secure link.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  if (createdData) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-center w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full mb-6 mx-auto">
          <Check size={24} />
        </div>
        <h2 className="text-2xl font-bold text-center text-white mb-2">Secret Created Securely</h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          Your secret is encrypted. Send the link and access code through two different channels for maximum security.
        </p>

        <div className="space-y-6">
          {/* Link Block */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Secret Link
            </label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-4">
              <span className="flex-1 font-mono text-emerald-400 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                {createdData.link}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.link, setCopiedLink)}
                className="ml-4 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Code Block */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Decryption Access Code
            </label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-4">
              <span className="flex-1 font-mono font-bold text-amber-400 text-xl tracking-widest">
                {createdData.code}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.code, setCopiedCode)}
                className="ml-4 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
          <button
            onClick={() => { setSecret(''); setCreatedData(null); }}
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            Create another secret
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="secret" className="block text-sm font-medium text-zinc-300 mb-2">
            Your Secret
          </label>
          <textarea
            id="secret"
            rows={6}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-y"
            placeholder="Paste your sensitive data, passwords, or messages here..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Self-Destruct (Views)
            </label>
            <select
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={maxViews}
              onChange={(e) => setMaxViews(e.target.value)}
            >
              <option value="0">Unlimited Views</option>
              <option value="1">1 View (Burn after reading)</option>
              <option value="5">5 Views</option>
              <option value="10">10 Views</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Expiration Time
            </label>
            <select
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <option value="0">Never Expire</option>
              <option value="600">10 Minutes</option>
              <option value="3600">1 Hour</option>
              <option value="86400">1 Day</option>
              <option value="604800">1 Week</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !secret.trim()}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-lg transition-colors"
          >
            <Lock size={18} />
            {isSubmitting ? 'Encrypting & Securing...' : 'Create Secret Link'}
          </button>
          <p className="text-center text-xs text-zinc-500 mt-4">
            Encryption happens locally in your browser. The server never sees your secret.
          </p>
        </div>
      </form>
    </div>
  );
}
