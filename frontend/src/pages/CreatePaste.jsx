import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateAccessCode, encryptFull } from '../lib/crypto';
import { createPaste } from '../lib/api';
import { Copy, Check, Lock, Shield, ExternalLink, ArrowRight, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function CreatePaste() {
  const [secret, setSecret] = useState('');
  const [maxViews, setMaxViews] = useState('0'); // 0 = unlimited
  const [expiresIn, setExpiresIn] = useState('86400'); // default 1 day
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdData, setCreatedData] = useState(null); // { id, code, link, creatorToken, dashboardLink }
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedDash, setCopiedDash] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secret.trim()) return;

    setIsSubmitting(true);
    try {
      // 1. Generate access code
      const code = await generateAccessCode();

      // 2. Encrypt the secret locally
      const { ciphertext, iv, salt } = await encryptFull(secret, code);

      // 3. Send encrypted data to backend
      const { id, creator_token } = await createPaste({
        ciphertext,
        iv,
        salt,
        maxViews: maxViews === '0' ? null : Number(maxViews),
        expiresInSeconds: expiresIn === '0' ? null : Number(expiresIn),
      });

      const link = `${window.location.origin}/view/${id}`;
      const dashboardLink = `${window.location.origin}/dashboard/${id}?token=${creator_token}`;
      setCreatedData({ id, code, link, creatorToken: creator_token, dashboardLink });
    } catch (err) {
      console.error('Error creating paste:', err);
      alert(err.message || 'Something went wrong creating your secure link.');
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300 space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full mb-4 mx-auto">
            <Check size={24} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Secret Created Securely</h2>
          <p className="text-zinc-400 text-sm max-w-md mx-auto">
            Your secret is encrypted in your browser. Send the link and access code through two separate channels.
          </p>
        </div>

        <div className="space-y-4">
          {/* Link Block */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                1. Secret Link (Share with recipient)
              </label>
              <button 
                onClick={() => setShowQR(!showQR)}
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <QrCode size={14} />
                {showQR ? 'Hide QR' : 'Show QR'}
              </button>
            </div>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-4 mb-2">
              <span className="flex-1 font-mono text-emerald-400 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                {createdData.link}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.link, setCopiedLink)}
                className="ml-3 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
            </div>
            {showQR && (
              <div className="flex justify-center p-4 bg-white rounded-lg mt-2 w-max mx-auto border border-zinc-200 shadow-sm animate-in zoom-in-95 duration-200">
                <QRCodeSVG value={createdData.link} size={150} level="M" />
              </div>
            )}
          </div>

          {/* Code Block */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              2. Decryption Access Code (Send via separate channel)
            </label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-4">
              <span className="flex-1 font-mono font-bold text-amber-400 text-xl tracking-widest">
                {createdData.code}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.code, setCopiedCode)}
                className="ml-3 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>
          </div>

          {/* Creator Security Dashboard Link */}
          <div className="pt-2">
            <div className="bg-zinc-950/80 border border-emerald-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                  <Shield size={16} />
                  <span>Creator Management & Security Dashboard</span>
                </div>
                <Link
                  to={`/dashboard/${createdData.id}?token=${createdData.creatorToken}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Open Dashboard <ArrowRight size={14} />
                </Link>
              </div>
              <p className="text-xs text-zinc-400">
                Track view telemetry, monitor failed decryption attempts, or lock/destroy this secret at any time.
              </p>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 pl-3">
                <span className="flex-1 font-mono text-zinc-400 text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                  {createdData.dashboardLink}
                </span>
                <button
                  onClick={() => copyToClipboard(createdData.dashboardLink, setCopiedDash)}
                  className="ml-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md transition-colors text-xs font-medium"
                >
                  {copiedDash ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedDash ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => { setSecret(''); setCreatedData(null); }}
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            &larr; Create another secret
          </button>
          <Link
            to={`/dashboard/${createdData.id}?token=${createdData.creatorToken}`}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            Go to Security Dashboard <ExternalLink size={14} />
          </Link>
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
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-y font-mono text-sm"
            placeholder="Paste your sensitive data, API keys, passwords, or private notes here..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Self-Destruct (View Count Limit)
            </label>
            <select
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
              value={maxViews}
              onChange={(e) => setMaxViews(e.target.value)}
            >
              <option value="0">Unlimited Views</option>
              <option value="1">1 View (Burn immediately after reading)</option>
              <option value="5">5 Views</option>
              <option value="10">10 Views</option>
              <option value="25">25 Views</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Expiration Time (TTL)
            </label>
            <select
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <option value="600">10 Minutes</option>
              <option value="3600">1 Hour</option>
              <option value="86400">1 Day (Default)</option>
              <option value="604800">1 Week</option>
              <option value="2592000">30 Days</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !secret.trim()}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-lg transition-colors text-sm"
          >
            <Lock size={18} />
            {isSubmitting ? 'Encrypting & Generating Telemetry...' : 'Create Secure Secret Link'}
          </button>
          <p className="text-center text-xs text-zinc-500 mt-4">
            Zero-knowledge client-side encryption. The server only sees ciphertext and never stores your access code.
          </p>
        </div>
      </form>
    </div>
  );
}
