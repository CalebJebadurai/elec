import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GLOSSARY } from '../content/glossary';

export default function GlossaryPage() {
  const [query, setQuery] = useState('');
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        g.short.toLowerCase().includes(q) ||
        (g.more || '').toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="max-w-3xl mx-auto px-1 py-6 text-neutral-200 text-sm leading-relaxed">
      <h2 className="text-xl font-semibold text-white mb-1">Glossary</h2>
      <p className="text-neutral-400 mb-4">Election terms used on this site, in plain language.</p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search terms…"
        aria-label="Search glossary"
        className="w-full md:w-72 bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm mb-5 placeholder:text-neutral-500 focus:outline-none focus:border-primary-400 min-h-[44px]"
      />
      {entries.length === 0 && <p className="text-neutral-400">No matching terms.</p>}
      <dl className="space-y-4">
        {entries.map((g) => (
          <div
            key={g.id}
            id={g.id}
            className="scroll-mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4"
          >
            <dt className="text-sm font-semibold text-white">{g.term}</dt>
            <dd className="mt-1 text-neutral-200">{g.short}</dd>
            {g.more && <dd className="mt-1 text-neutral-400 text-xs">{g.more}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
