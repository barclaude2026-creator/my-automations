import { useState, useRef, useCallback } from 'react';

export default function UploadPanel({ onRun, isRunning }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['md', 'txt'].includes(ext)) {
      alert('Please upload a .md or .txt file.');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview((e.target.result || '').slice(0, 300));
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleInputChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const handleRun = () => {
    if (file && !isRunning) {
      onRun(file);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Upload Transcript</h2>
        <p className="text-sm text-gray-500">Accepts .md and .txt webinar transcripts</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
          cursor-pointer transition-all duration-200 p-8
          ${dragOver
            ? 'border-orange-500 bg-orange-500/10'
            : file
            ? 'border-green-600 bg-green-900/10'
            : 'border-gray-700 hover:border-orange-600 hover:bg-orange-500/5 bg-[#1a1a1a]'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="text-4xl select-none">
          {file ? '✅' : '📄'}
        </div>

        {file ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-green-400">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              {(file.size / 1024).toFixed(1)} KB — click to replace
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-gray-300 font-medium">
              Drop your transcript here
            </p>
            <p className="text-xs text-gray-600 mt-1">or click to browse</p>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-lg border border-gray-800 bg-[#141414] p-3">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">Preview</p>
          <p className="text-xs text-gray-400 leading-relaxed font-mono whitespace-pre-wrap break-words">
            {preview}
            {preview.length >= 300 && (
              <span className="text-gray-600">…</span>
            )}
          </p>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!file || isRunning}
        className={`
          w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200
          ${!file || isRunning
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer shadow-lg shadow-orange-900/30 hover:shadow-orange-800/40'
          }
        `}
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Running 4 Duda skills...
          </span>
        ) : (
          'Run the Machine'
        )}
      </button>

      {/* Info */}
      {file && !isRunning && (
        <p className="text-xs text-gray-600 text-center">
          Will generate 4 assets in parallel via Claude
        </p>
      )}
    </div>
  );
}
