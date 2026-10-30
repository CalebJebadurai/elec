import { useState } from 'react';
import { TCPD_DATASET, TCPD_URL, formatSnapshot, viewCitation } from '../content/dataSource';

interface Props {
  /** Short title of what is on screen, used in the citation */
  viewTitle: string;
  /** Latest election year shown in this view, if known */
  latestYear?: number | null;
}

/** TCPD credit, data snapshot date and a copyable citation for the current view. */
export default function DataSourceStamp({ viewTitle, latestYear }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const citation = viewCitation(
    viewTitle,
    typeof window !== 'undefined' ? window.location.href : ''
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
      <p>
        Source:{' '}
        <a
          href={TCPD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-300 underline"
        >
          {TCPD_DATASET}, Trivedi Centre for Political Data, Ashoka University
        </a>{' '}
        · data snapshot {formatSnapshot()}
        {latestYear ? ` · latest election shown: ${latestYear}` : ''} ·{' '}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-primary-300 underline cursor-pointer"
        >
          Cite this
        </button>
      </p>
      {open && (
        <div className="mt-2 bg-neutral-900 border border-neutral-800 rounded-lg p-3">
          <p className="text-neutral-200 select-all">{citation}</p>
          <button
            type="button"
            onClick={copy}
            className="mt-2 bg-neutral-800 text-neutral-200 px-3 py-1.5 rounded-md border border-neutral-700 hover:bg-neutral-700 cursor-pointer min-h-[44px] md:min-h-0"
          >
            {copied ? 'Copied' : 'Copy citation'}
          </button>
        </div>
      )}
    </div>
  );
}
