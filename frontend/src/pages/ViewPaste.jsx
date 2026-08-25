import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPaste, reportFailure } from '../lib/api';
import { decryptFull } from '../lib/crypto';
import { Key, Lock, Unlock, AlertTriangle, ShieldCheck, Copy, Check, File, Download, ArrowUpRight, Eye } from 'lucide-react';

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
        } else if (report.locked) {
          setFetchError(report.message || 'Paste locked temporarily due to excessive failed decryption attempts.');
          setEncryptedData(null);
        } else {
          setDecryptError(`Incorrect code. ${report.attempts_remaining} attempts remaining before auto-burn.`);
        }
      } catch (reportErr) {
        setDecryptError('Incorrect access code or corrupted payload.');
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
        <div className="animate-pulse text-gray-500 font-bold tracking-widest text-sm uppercase">Loading secure payload...</div>
      </div>
    );
  }

  // Handle Fetch Errors
  if (fetchError) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 shadow-sm text-center max-w-md mx-auto mt-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 text-red-500 rounded-full mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">Secret Unavailable</h2>
        <p className="text-gray-500 text-sm mb-6">{fetchError}</p>
        <Link to="/" className="inline-block text-[#3733A5] hover:underline font-bold text-sm">
          Create a new secret &rarr;
        </Link>
      </div>
    );
  }

  let decryptedPayload = null;
  try {
    if (decryptedSecret) {
      decryptedPayload = JSON.parse(decryptedSecret);
    }
  } catch (err) {
    decryptedPayload = { text: decryptedSecret, files: null };
  }

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
      <div className="w-full max-w-3xl mx-auto mt-4 space-y-8">
        <div className="text-center mb-8">
           <p className="text-xs font-bold text-green-600 tracking-widest uppercase mb-4">
             ● SECRET DECRYPTED
           </p>
           <h2 className="text-3xl font-extrabold text-[#1a1a1a] mb-2 tracking-tight">View your secure data</h2>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#F9FAFB] px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#3733A5]">
              <ShieldCheck size={18} />
              <span className="font-bold text-xs tracking-widest uppercase">Decrypted Secret</span>
            </div>
            {textToShow && (
              <button 
                onClick={() => copySecret(textToShow)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#1a1a1a] transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500"/> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {textToShow ? (
            <div className="p-8">
              <pre className="font-mono whitespace-pre-wrap text-[#1a1a1a] text-sm leading-relaxed">
                {textToShow}
              </pre>
            </div>
          ) : (
            <div className="p-8 text-gray-400 italic text-center text-sm font-medium">
              No text message attached.
            </div>
          )}
        </div>

        {/* Attached Decrypted Files */}
        {files.length > 0 && (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 shadow-sm space-y-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Attached Secure Files ({files.length})
            </h3>
            
            <div className="space-y-6">
              {files.map((file, idx) => (
                <div key={idx} className="space-y-4 border-b border-gray-100 last:border-b-0 pb-6 last:pb-0">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-3 bg-blue-50 text-[#3733A5] rounded-md">
                        <File size={24} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-[#1a1a1a] truncate">{file.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Unknown Type'}
                        </p>
                      </div>
                    </div>
                    
                    <a
                      href={file.data}
                      download={file.name}
                      className="flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#333333] text-white font-bold py-2 px-6 rounded-md transition-colors text-xs w-full md:w-auto cursor-pointer"
                    >
                      <Download size={14} />
                      Download
                    </a>
                  </div>

                  {file.type && file.type.startsWith('image/') && (
                    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-gray-50 p-2 flex justify-center">
                      <img
                        src={file.data}
                        alt={file.name}
                        className="max-h-96 object-contain rounded-md shadow-sm"
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
    <div className="w-full max-w-2xl mx-auto mt-4">
      <div className="text-center mb-10">
        <p className="text-xs font-bold text-[#3733A5] tracking-widest uppercase mb-4">
          01 / Verify Invitation
        </p>
        <h2 className="text-4xl font-extrabold text-[#1a1a1a] mb-3 tracking-tight">Enter access code</h2>
        <p className="text-gray-500 text-sm font-medium">
          This private secret is waiting for the person who received its link and code.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 pb-10">
          <form onSubmit={handleDecrypt} className="space-y-4">
            <div className="flex items-center gap-3 mb-4 text-[#3733A5]">
              <div className="p-2 bg-[#EEF2FF] rounded-lg">
                <Lock size={20} />
              </div>
              <label className="text-xs font-bold uppercase tracking-widest">
                Access Code
              </label>
            </div>
            
            <div className="flex items-center border border-[#E5E7EB] rounded-xl p-1.5 focus-within:border-[#3733A5] focus-within:ring-1 focus-within:ring-[#3733A5] transition-all">
              <input
                type="text"
                autoFocus
                required
                className="flex-1 bg-transparent px-4 py-3 text-[#1a1a1a] placeholder-gray-400 font-mono text-sm focus:outline-none"
                placeholder="e.g. 7K4P — enter code"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setDecryptError('');
                }}
              />
              <button
                type="submit"
                disabled={isDecrypting || !accessCode.trim()}
                className="flex items-center gap-2 bg-[#3733A5] hover:bg-[#2B2785] disabled:opacity-50 text-white font-bold py-3 px-6 rounded-lg transition-colors text-xs"
              >
                {isDecrypting ? 'Decrypting...' : (
                  <>
                    VIEW SECRET <ArrowUpRight size={16} className="opacity-80" />
                  </>
                )}
              </button>
            </div>
            {decryptError && (
              <p className="text-red-500 text-xs font-bold ml-2">
                {decryptError}
              </p>
            )}
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-2 ml-1">
              <span className="w-3 h-3 rounded-full border border-gray-300 flex items-center justify-center text-[8px] font-bold text-gray-400">i</span>
              The code is case-sensitive and can only unlock this private link.
            </p>
          </form>
        </div>

        {/* Message / File Preview Box */}
        <div className="bg-[#FAFAFA] rounded-2xl border border-[#E5E7EB] p-6 opacity-60 pointer-events-none relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 text-gray-400">
              <File size={16} />
              <span className="text-xs font-bold tracking-widest uppercase">Message / File</span>
            </div>
            <div className="flex items-center gap-1.5 bg-gray-200 text-gray-500 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> Locked - Awaiting code
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
              <Lock className="text-gray-300" size={24} />
            </div>
            <div className="h-32 bg-white border border-gray-200 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden">
              <div>
                <p className="text-[10px] font-bold text-[#3733A5] uppercase tracking-widest mb-2">After code is verified</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                     <File size={14} className="text-gray-400" />
                  </div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Photo / File Preview</span>
                </div>
              </div>
              <Eye className="absolute right-4 bottom-4 text-gray-200" size={32} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
