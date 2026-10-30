import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { findGlossaryEntry } from '../content/glossary';

interface Props {
  id: string;
  children?: ReactNode;
}

/** Inline glossary term: dotted underline, plain-language hint on hover, links to the glossary. */
export default function Term({ id, children }: Props) {
  const entry = findGlossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <Link
      to={`/glossary#${entry.id}`}
      title={entry.short}
      className="underline decoration-dotted decoration-neutral-500 underline-offset-2 hover:decoration-primary-400"
    >
      {children ?? entry.term}
    </Link>
  );
}
