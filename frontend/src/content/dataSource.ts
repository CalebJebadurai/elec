/**
 * Where the election data comes from. Update TCPD_SNAPSHOT whenever the
 * database is re-seeded from a newer TCPD download (see infra/seed-railway-all.sh),
 * or set VITE_TCPD_SNAPSHOT at build time.
 */
export const TCPD_SNAPSHOT: string = import.meta.env.VITE_TCPD_SNAPSHOT || '2026-04-20';

export const TCPD_DATASET = 'TCPD Indian Elections Data v2.0';
export const TCPD_URL = 'https://tcpd.ashoka.edu.in/';
export const LOK_DHABA_URL = 'https://lokdhaba.ashoka.edu.in/';

/** Citation in the form TCPD asks users of its data to use. */
export const TCPD_CITATION =
  'Ananay Agarwal, Neelesh Agrawal, Saloni Bhogale, Sudheendra Hangal, Francesca Refsum Jensenius, ' +
  'Mohit Kumar, Chinmay Narayan, Basim U Nissa, Priyamvada Trivedi, and Gilles Verniers. 2021. ' +
  '“TCPD Indian Elections Data v2.0”, Trivedi Centre for Political Data, Ashoka University.';

export function formatSnapshot(iso: string = TCPD_SNAPSHOT): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Citation for a specific view, including the snapshot date and page URL. */
export function viewCitation(viewTitle: string, url: string, accessed = new Date()): string {
  const acc = accessed.toISOString().slice(0, 10);
  return `${viewTitle}. Election Analytics, ${url} (accessed ${acc}). Data: ${TCPD_CITATION} Snapshot of ${TCPD_SNAPSHOT}.`;
}
