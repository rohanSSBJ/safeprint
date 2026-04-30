import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

const DocxPreviewViewer = ({ url }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadDocx = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Could not load document preview.');
        }

        const blob = await response.blob();
        if (!isMounted || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        await renderAsync(blob, containerRef.current, null, {
          breakPages: true,
          className: 'safeprint-docx-preview',
          inWrapper: false,
        });

        if (isMounted) setLoading(false);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('DOCX Render Error:', err);
        if (isMounted) {
          setError('Failed to render document preview.');
          setLoading(false);
        }
      }
    };

    loadDocx();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [url]);

  return (
    <div
      className="relative w-full h-full overflow-auto bg-slate-800 p-4 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={containerRef}
        className="mx-auto max-w-[850px] [&_.docx-wrapper]:!bg-transparent [&_.docx]:!mx-auto [&_.docx]:!my-4"
      />

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-800/80 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium">Rendering secure preview...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      />
    </div>
  );
};

export default DocxPreviewViewer;
