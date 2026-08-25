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
        expiresInSeconds: expiresIn === '0' ? null : Number(expiresIn) * 60
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
      <div className="bg-custom-card border border-custom-border rounded-xl p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-center w-12 h-12 bg-custom-accent/20 text-custom-accent rounded-full mb-6 mx-auto">
          <Check size={24} />
        </div>
        <h2 className="text-2xl font-bold text-center text-custom-textPrimary mb-2">Secret Created Securely</h2>
        <p className="text-custom-textSecondary text-center mb-8 text-sm">
          Your secret is encrypted. Send the link and access code through two different channels for maximum security.
        </p>

        <div className="space-y-6">
          {/* Link Block */}
          <div>
            <label className="block text-xs font-semibold text-custom-textSecondary uppercase tracking-wider mb-2">
              Secret Link
            </label>
            <div className="flex items-center bg-custom-bg border border-custom-border rounded-lg p-1 pl-4">
              <span className="flex-1 font-mono text-custom-accent text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                {createdData.link}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.link, setCopiedLink)}
                className="ml-4 flex items-center gap-2 bg-custom-card border border-custom-border hover:bg-custom-border text-custom-textPrimary px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedLink ? <Check size={16} className="text-custom-accent" /> : <Copy size={16} />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Code Block */}
          <div>
            <label className="block text-xs font-semibold text-custom-textSecondary uppercase tracking-wider mb-2">
              Decryption Access Code
            </label>
            <div className="flex items-center bg-custom-bg border border-custom-border rounded-lg p-1 pl-4">
              <span className="flex-1 font-mono font-bold text-custom-warning text-xl tracking-widest">
                {createdData.code}
              </span>
              <button
                onClick={() => copyToClipboard(createdData.code, setCopiedCode)}
                className="ml-4 flex items-center gap-2 bg-custom-card border border-custom-border hover:bg-custom-border text-custom-textPrimary px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {copiedCode ? <Check size={16} className="text-custom-accent" /> : <Copy size={16} />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-custom-border">
          <Dashboard pasteId={createdData.id} adminTokenProp={createdData.admin_token} />
        </div>

        <div className="mt-8 pt-6 border-t border-custom-border text-center">
          <button 
            onClick={() => { setSecret(''); setSelectedFiles([]); setCreatedData(null); }}
            className="text-custom-textSecondary hover:text-custom-textPrimary transition-colors text-sm"
          >
            Create another secret
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-custom-card border border-custom-border rounded-xl p-6 sm:p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="secret" className="block text-sm font-medium text-custom-textPrimary mb-2">
            Your Secret Message
          </label>
          <textarea
            id="secret"
            rows={6}
            className="w-full bg-custom-bg border border-custom-border rounded-lg p-4 text-custom-textPrimary placeholder-custom-textSecondary focus:outline-none focus:ring-2 focus:ring-custom-accent/50 focus:border-custom-accent transition-all resize-y"
            placeholder="Paste your sensitive data, passwords, or messages here..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            required={selectedFiles.length === 0}
          />
        </div>
        {/* File Share Attachment */}
        <div>
          <label className="block text-sm font-medium text-custom-textPrimary mb-2">
            Attach Files (Optional, max 5MB per file, 15MB total)
          </label>
          
          {/* Dropzone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer relative group bg-custom-bg ${isDragging ? 'border-emerald-500 bg-custom-accent/5' : 'border-custom-border hover:border-custom-accent/50'}`}
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
            <div className={`flex flex-col items-center gap-2 transition-colors ${isDragging ? 'text-custom-accent' : 'text-custom-textSecondary group-hover:text-custom-textPrimary'}`}>
              <Paperclip size={24} className={`transition-colors ${isDragging ? 'text-custom-accent' : 'text-custom-textSecondary group-hover:text-custom-accent'}`} />
              <span className="text-sm font-medium">
                {isDragging ? 'Drop files here' : 'Click to upload or drag & drop multiple files'}
              </span>
              <span className="text-xs text-custom-textSecondary font-normal">Any file format · Up to 5MB per file · 15MB total</span>
            </div>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-custom-bg border border-custom-border rounded-lg p-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-custom-accent/10 text-custom-accent rounded-md">
                      <File size={16} />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-custom-textPrimary truncate">{file.name}</p>
                      <p className="text-xs text-custom-textSecondary">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-1.5 hover:bg-custom-card border border-custom-border text-custom-textSecondary hover:text-custom-textPrimary rounded-md transition-all"
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
            <label className="block text-sm font-medium text-custom-textPrimary mb-2">
              Max View Count
            </label>
            <input
              type="number"
              min="0"
              className="w-full bg-custom-bg border border-custom-border rounded-lg p-3 text-custom-textPrimary focus:outline-none focus:ring-2 focus:ring-custom-accent/50"
              value={maxViews}
              onChange={(e) => setMaxViews(e.target.value)}
              placeholder="0 for unlimited"
            />
            <p className="text-xs text-custom-textSecondary mt-1">0 for unlimited</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-custom-textPrimary mb-2">
              Expiration Time (Minutes)
            </label>
            <input
              type="number"
              min="0"
              className="w-full bg-custom-bg border border-custom-border rounded-lg p-3 text-custom-textPrimary focus:outline-none focus:ring-2 focus:ring-custom-accent/50"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              placeholder="0 for never expire"
            />
            <p className="text-xs text-custom-textSecondary mt-1">0 for never expire</p>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || (!secret.trim() && selectedFiles.length === 0)}
            className="w-full flex items-center justify-center gap-2 bg-custom-accent hover:bg-custom-accent disabled:bg-custom-disabled disabled:cursor-not-allowed text-custom-textPrimary font-semibold py-3.5 px-4 rounded-lg transition-colors"
          >
            <Lock size={18} />
            {isSubmitting ? 'Encrypting & Securing...' : 'Create Secret Link'}
          </button>
          <p className="text-center text-xs text-custom-textSecondary mt-4">
            Encryption happens locally in your browser. The server never sees your secret.
          </p>
        </div>
      </form>
    </div>
  );
}
