import React, { useState, useRef } from 'react';
import { generateAccessCode, encryptFull } from '../lib/crypto';
import { createPaste } from '../lib/api';
import { Copy, Check, Lock, Paperclip, X, File, BarChart } from 'lucide-react';
import Dashboard from './Dashboard';

const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export default function CreatePaste() {
  const [secret, setSecret] = useState('');
  const [maxViews, setMaxViews] = useState('0'); // 0 = unlimited
  const [expiresIn, setExpiresIn] = useState('0'); // 0 = never
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const addFiles = (files) => {
    if (!files || files.length === 0) return;

    // Size check: max 5MB per file
    const tooLarge = files.some(file => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      alert("Individual files cannot exceed 5MB.");
      return;
    }

    // Size check: max 15MB total
    const currentTotalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    const newFilesSize = files.reduce((acc, f) => acc + f.size, 0);
    if (currentTotalSize + newFilesSize > 15 * 1024 * 1024) {
      alert("Total size of all attachments cannot exceed 15MB.");
      return;
    }

    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleFileChange = (e) => {
    addFiles(Array.from(e.target.files));
    // Reset the input value so the same file can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const removeFile = (indexToRemove) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secret.trim() && selectedFiles.length === 0) return;

    setIsSubmitting(true);
    try {
      // 1. Generate access code
      const code = await generateAccessCode();

      // 2. Read files and package payload
      const filePromises = selectedFiles.map(async (file) => {
        const dataUrl = await readFileAsDataURL(file);
        return {
          name: file.name,
          type: file.type,
          size: file.size,
          data: dataUrl
        };
      });
      const filesData = await Promise.all(filePromises);

      const payloadToEncrypt = JSON.stringify({
        text: secret,
        files: filesData.length > 0 ? filesData : null
      });

      // 3. Encrypt the packaged payload locally
      const { ciphertext, iv, salt } = await encryptFull(payloadToEncrypt, code);

      // 4. Send encrypted data to backend
      const { id, admin_token } = await createPaste({
        ciphertext,
        iv,
        salt,
        maxViews: maxViews === '0' ? null : Number(maxViews),
        expiresInSeconds: expiresIn === '0' ? null : Number(expiresIn)
      });

      const link = `${window.location.origin}/view/${id}`;
      setCreatedData({ id, code, link, admin_token });
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

        <div className="mt-8 pt-6 border-t border-zinc-800">
          <Dashboard pasteId={createdData.id} adminTokenProp={createdData.admin_token} />
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
          <button 
            onClick={() => { setSecret(''); setSelectedFiles([]); setCreatedData(null); }}
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
            Your Secret Message
          </label>
          <textarea
            id="secret"
            rows={6}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-y"
            placeholder="Paste your sensitive data, passwords, or messages here..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            required={selectedFiles.length === 0}
          />
        </div>
        {/* File Share Attachment */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Attach Files (Optional, max 5MB per file, 15MB total)
          </label>
          
          {/* Dropzone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer relative group bg-zinc-950/20 ${isDragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-800 hover:border-emerald-500/50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className={`flex flex-col items-center gap-2 transition-colors ${isDragging ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
              <Paperclip size={24} className={`transition-colors ${isDragging ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-emerald-400'}`} />
              <span className="text-sm font-medium">
                {isDragging ? 'Drop files here' : 'Click to upload or drag & drop multiple files'}
              </span>
              <span className="text-xs text-zinc-600 font-normal">Any file format · Up to 5MB per file · 15MB total</span>
            </div>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-md">
                      <File size={16} />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                      <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-md transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Self-Destruct (Views)
            </label>
            <input
              type="number"
              min="0"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={maxViews}
              onChange={(e) => setMaxViews(e.target.value)}
              placeholder="0 for unlimited"
            />
            <p className="text-xs text-zinc-500 mt-1">0 for unlimited</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Expiration Time (Seconds)
            </label>
            <input
              type="number"
              min="0"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              placeholder="0 for never expire"
            />
            <p className="text-xs text-zinc-500 mt-1">0 for never expire</p>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || (!secret.trim() && selectedFiles.length === 0)}
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
