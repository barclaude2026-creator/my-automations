import { useState, useRef, useEffect } from 'react';

const STATUS_CONFIG = {
  idle: {
    label: 'Idle',
    dotClass: 'bg-gray-500',
    borderClass: 'border-gray-700',
    textClass: 'text-gray-500',
  },
  generating: {
    label: 'Generating...',
    dotClass: 'bg-orange-500 animate-pulse',
    borderClass: 'border-orange-500 animate-pulse-border',
    textClass: 'text-orange-400',
  },
  done: {
    label: 'Done',
    dotClass: 'bg-green-500',
    borderClass: 'border-green-600',
    textClass: 'text-green-400',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-700',
    textClass: 'text-red-400',
  },
};

export default function AssetCard({ name, status, content, elapsed, error }) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  // Auto-scroll as content streams in
  useEffect(() => {
    if (contentRef.current && status === 'generating') {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, status]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`flex flex-col rounded-xl border bg-[#1a1a1a] transition-all duration-300 ${cfg.borderClass}`}
      style={{ minHeight: '320px' }}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white tracking-wide">{name}</h3>
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${cfg.dotClass}`} />
            <span className={`text-xs font-medium ${cfg.textClass}`}>
              {status === 'done' && elapsed != null
                ? `Done in ${elapsed}s`
                : cfg.label}
            </span>
          </div>

          {/* Copy button */}
          {status === 'done' && content && (
            <button
              onClick={handleCopy}
              className="ml-2 px-2.5 py-1 text-xs rounded-md bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-4"
        style={{ maxHeight: '400px' }}
      >
        {status === 'idle' && (
          <p className="text-gray-600 text-sm italic">Waiting to generate...</p>
        )}

        {status === 'error' && (
          <p className="text-red-400 text-sm">{error || 'An error occurred.'}</p>
        )}

        {(status === 'generating' || status === 'done') && content && (
          <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
            {content}
          </pre>
        )}

        {status === 'generating' && !content && (
          <div className="flex items-center gap-2 text-orange-400 text-sm">
            <span className="animate-pulse">Generating</span>
            <span className="flex gap-1">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
