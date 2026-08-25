import React, { useState, useRef } from 'react';
import { generateAccessCode, encryptFull } from '../lib/crypto';
import { createPaste } from '../lib/api';
import { Copy, Shield, ShieldCheck, ArrowRight, X, File, Paperclip, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

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
  const [secretType, setSecretType] = useState('message'); // 'message' or 'file'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const addFiles = (files) => {
    if (!files || files.length === 0) return;
    const tooLarge = files.some(file => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      alert("Individual files cannot exceed 5MB.");
      return;
    }
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (indexToRemove) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (secretType === 'message' && !secret.trim()) return;
    if (secretType === 'file' && selectedFiles.length === 0) return;

    setIsSubmitting(true);
    try {
      const code = await generateAccessCode();
      
      let payloadToEncrypt = "";
      if (secretType === 'message') {
        payloadToEncrypt = JSON.stringify({ text: secret, files: null });
      } else {
        const filePromises = selectedFiles.map(async (file) => {
          const dataUrl = await readFileAsDataURL(file);
          return { name: file.name, type: file.type, size: file.size, data: dataUrl };
        });
        const filesData = await Promise.all(filePromises);
        payloadToEncrypt = JSON.stringify({ text: "", files: filesData });
      }

      const { ciphertext, iv, salt } = await encryptFull(payloadToEncrypt, code);

      const { id, admin_token } = await createPaste({
        ciphertext,
        iv,
        salt,
        maxViews: maxViews === '0' ? null : Number(maxViews),
        expiresInSeconds: expiresIn === '0' ? null : Number(expiresIn),
      });

      const link = `${window.location.origin}/view/${id}`;
      setCreatedData({ id, code, link, admin_token });
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
      <div className="w-full max-w-4xl mx-auto mt-6">
        <div className="text-center mb-8">
          <p className="text-xs font-bold text-[#3733A5] tracking-widest uppercase mb-4">
            ● Link Created
          </p>
          <h2 className="text-4xl font-extrabold text-[#1a1a1a] mb-2 tracking-tight">
            Your secret is ready to share.
          </h2>
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#6b7280] font-medium mt-4">
            <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
            </span>
            AUTO-BURNS IN 24 hours from creation
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Side: Share Details */}
          <div className="p-8 md:w-3/5 border-b md:border-b-0 md:border-r border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[#3733A5] font-bold text-xs tracking-widest uppercase">01 / Share Details</p>
              <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded text-[10px] font-bold tracking-widest uppercase border border-gray-200">
                One-Time Secret
              </span>
            </div>
            
            <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">Send both pieces separately.</h3>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Private Link</label>
                  <span className="text-[10px] text-gray-400">VISIBLE TO ANYONE WITH URL</span>
                </div>
                <div className="flex items-center bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-1 pl-4 focus-within:border-[#3733A5] transition-colors">
                  <span className="flex-1 font-mono text-gray-600 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="mr-2 opacity-50">🔗</span>
                    {createdData.link}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdData.link, setCopiedLink)}
                    className="ml-2 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#1a1a1a] px-4 py-2 rounded-md transition-colors text-xs font-bold"
                  >
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Access Code</label>
                  <span className="text-[10px] text-gray-400">REQUIRED TO OPEN</span>
                </div>
                <div className="flex items-center bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-1 pl-4 focus-within:border-[#3733A5] transition-colors">
                  <span className="flex-1 font-mono font-bold text-[#1a1a1a] text-sm tracking-widest">
                    <span className="mr-2 opacity-50">🗝️</span>
                    {createdData.code}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdData.code, setCopiedCode)}
                    className="ml-2 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#1a1a1a] px-4 py-2 rounded-md transition-colors text-xs font-bold"
                  >
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg p-4 flex gap-3 text-sm text-[#4338CA]">
                <Shield className="shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-bold mb-1">Both pieces are required.</p>
                  <p className="opacity-90 leading-relaxed text-xs">Anyone with the private link still needs this access code to open the secret. Share them through separate channels.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Secret Status */}
          <div className="p-8 md:w-2/5 bg-[#FAFAFA] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-500 font-bold text-xs tracking-widest uppercase">Secret Status</p>
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold tracking-widest uppercase border border-green-200">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Active
                </span>
              </div>
              
              <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center mb-6">
                <QrCode className="text-gray-300 mb-3" size={32} />
                <p className="text-gray-500 font-bold text-sm tracking-wide">PROTECTED SECRET</p>
                <p className="text-gray-400 text-xs mt-1">No preview available here</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">Created</span>
                  <span className="text-[#1a1a1a] font-bold">Today, Just now</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">Burn condition</span>
                  <span className="text-[#1a1a1a] font-bold">
                    {maxViews === '0' ? 'Unlimited views' : `${maxViews} views`} or {expiresIn === '0' ? 'Never' : `${expiresIn}s`}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-4 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border border-gray-300 flex items-center justify-center text-[8px]">i</span>
                Keep this page open to monitor access activity.
              </p>
            </div>
          </div>
        </div>
        
        <div className="text-center mt-8">
          <Link to={`/dashboard/${createdData.id}?token=${createdData.admin_token}`} className="text-xs font-bold text-[#3733A5] hover:underline">
            Open Advanced Security Dashboard &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-4">
      <div className="text-center mb-8">
        <p className="text-xs font-bold text-green-600 tracking-widest uppercase mb-4">
          ● CREATE A SECRET
        </p>
        <p className="text-gray-500 text-sm font-medium">
          Write something private, set its limits, and share one secure link.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8">
        <div className="flex items-center justify-between mb-8">
          <p className="text-[#3733A5] font-bold text-xs tracking-widest uppercase">01 / Compose</p>
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold tracking-widest uppercase border border-blue-200">
            <ShieldCheck size={12} /> ENCRYPTED DRAFT
          </span>
        </div>

        <h2 className="text-3xl font-extrabold text-[#1a1a1a] mb-2 tracking-tight">Create a new secret</h2>
        <p className="text-sm text-gray-500 mb-8">
          Your message stays private until someone uses the link and access code.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Max Time</label>
              <div className="relative">
                <select 
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3 text-sm font-bold text-[#1a1a1a] appearance-none focus:outline-none focus:border-[#3733A5] focus:ring-1 focus:ring-[#3733A5]"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                >
                  <option value="0">Never</option>
                  <option value="3600">1 hour</option>
                  <option value="86400">1 day</option>
                  <option value="604800">7 days</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
                  ▼
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">View Count</label>
              <div className="relative">
                <select 
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3 text-sm font-bold text-[#1a1a1a] appearance-none focus:outline-none focus:border-[#3733A5] focus:ring-1 focus:ring-[#3733A5]"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                >
                  <option value="0">Unlimited</option>
                  <option value="1">1 view</option>
                  <option value="5">5 views</option>
                  <option value="10">10 views</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
                  ▼
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Secret Type</label>
            <div className="flex bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSecretType('message')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-bold transition-all ${
                  secretType === 'message' 
                    ? 'bg-white shadow-sm border border-gray-200 text-[#3733A5]' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="opacity-50">≡</span> Message
              </button>
              <button
                type="button"
                onClick={() => setSecretType('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-bold transition-all ${
                  secretType === 'file' 
                    ? 'bg-white shadow-sm border border-gray-200 text-[#3733A5]' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Paperclip size={16} className="opacity-50" /> File / photo
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Message / File</label>
              <span className="text-[10px] text-gray-400 font-medium tracking-wide">nothing is saved in your browser</span>
            </div>
            
            <div className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-lg overflow-hidden focus-within:border-[#3733A5] focus-within:ring-1 focus-within:ring-[#3733A5] transition-all relative">
              <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
                backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}></div>
              
              {secretType === 'message' ? (
                <textarea
                  className="w-full bg-transparent p-6 text-[#1a1a1a] placeholder-gray-400 focus:outline-none resize-none font-mono text-sm min-h-[200px] relative z-10"
                  placeholder="Write a secret message..."
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  required={secretType === 'message'}
                />
              ) : (
                <div className="min-h-[200px] flex flex-col items-center justify-center p-6 relative z-10">
                   <div
                    className={`w-full h-full min-h-[160px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-[#3733A5] bg-[#EEF2FF]' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      addFiles(Array.from(e.dataTransfer.files));
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Paperclip size={24} className="text-gray-400 mb-2" />
                    <p className="text-sm font-bold text-[#1a1a1a]">Click or drag files here</p>
                    <p className="text-xs text-gray-400 mt-1">Up to 5MB per file</p>
                  </div>
                  {selectedFiles.length > 0 && (
                    <div className="w-full mt-4 space-y-2">
                      {selectedFiles.map((f, i) => (
                         <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded p-2 text-sm">
                           <span className="truncate flex-1 font-mono text-xs">{f.name}</span>
                           <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-gray-400 hover:text-red-500 ml-2">
                             <X size={14} />
                           </button>
                         </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || (secretType === 'message' ? !secret.trim() : selectedFiles.length === 0)}
              className="bg-[#1a1a1a] hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-8 rounded-full transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
