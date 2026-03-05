import { useState, useCallback } from 'react';
import UploadPanel from './components/UploadPanel';
import AssetCard from './components/AssetCard';

const SKILL_IDS = ['success-story', 'power-quotes', 'use-case-slide', 'sales-email'];

const SKILL_NAMES = {
  'success-story': 'Customer Success Story',
  'power-quotes': 'Power Quotes',
  'use-case-slide': 'Use Case Slide',
  'sales-email': 'Sales Rep Email',
};

function makeInitialAssets() {
  return Object.fromEntries(
    SKILL_IDS.map((id) => [
      id,
      { status: 'idle', content: '', elapsed: null, error: null },
    ])
  );
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [assets, setAssets] = useState(makeInitialAssets());
  const [speakers, setSpeakers] = useState(null);

  const updateAsset = useCallback((skillId, patch) => {
    setAssets((prev) => ({
      ...prev,
      [skillId]: { ...prev[skillId], ...patch },
    }));
  }, []);

  const handleRun = useCallback(
    async (file) => {
      setIsRunning(true);
      setSpeakers(null);
      setAssets(makeInitialAssets());

      const formData = new FormData();
      formData.append('transcript', file);

      try {
        const response = await fetch(`${API_BASE}/api/generate`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let event;
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.type === 'speakers') {
              setSpeakers(event.data);
            } else if (event.type === 'status') {
              updateAsset(event.skillId, {
                status: event.status,
                elapsed: event.elapsed ?? null,
                error: event.error ?? null,
              });
            } else if (event.type === 'delta') {
              setAssets((prev) => ({
                ...prev,
                [event.skillId]: {
                  ...prev[event.skillId],
                  content: prev[event.skillId].content + event.text,
                },
              }));
            } else if (event.type === 'error') {
              console.error('Generation error:', event.message);
            }
          }
        }
      } catch (err) {
        console.error('Request failed:', err);
        // Mark all still-generating assets as errored
        setAssets((prev) => {
          const next = { ...prev };
          for (const id of SKILL_IDS) {
            if (next[id].status === 'generating' || next[id].status === 'idle') {
              next[id] = { ...next[id], status: 'error', error: err.message };
            }
          }
          return next;
        });
      } finally {
        setIsRunning(false);
      }
    },
    [updateAsset]
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans">
      {/* Header */}
      <header className="border-b border-gray-900 px-8 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-orange-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">D</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                Webinar Repurposing Machine
              </h1>
              <p className="text-xs text-gray-600">Duda Product Marketing</p>
            </div>
          </div>

          {speakers && (
            <div className="text-xs text-gray-500">
              <span className="text-gray-600">Customer:</span>{' '}
              <span className="text-orange-400 font-medium">
                {speakers.customer?.name}
              </span>
              {speakers.customer?.company && (
                <span className="text-gray-600"> · {speakers.customer.company}</span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <main className="max-w-screen-xl mx-auto px-8 py-8">
        <div className="flex gap-8">
          {/* Left Panel — Upload */}
          <aside className="w-72 flex-shrink-0">
            <div className="sticky top-8">
              <UploadPanel onRun={handleRun} isRunning={isRunning} />
            </div>
          </aside>

          {/* Right Panel — Asset Cards Grid */}
          <div className="flex-1 grid grid-cols-2 gap-5 auto-rows-fr">
            {SKILL_IDS.map((id) => (
              <AssetCard
                key={id}
                name={SKILL_NAMES[id]}
                status={assets[id].status}
                content={assets[id].content}
                elapsed={assets[id].elapsed}
                error={assets[id].error}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
