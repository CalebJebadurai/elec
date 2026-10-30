const REVIEWED = '30 Oct 2026';

const LINKS = [
  {
    title: 'Register as a new voter (Form 6)',
    href: 'https://voters.eci.gov.in/',
    note: "ECI Voters' Service Portal: apply online, track your application, download e-EPIC.",
  },
  {
    title: 'Check your name on the electoral roll',
    href: 'https://electoralsearch.eci.gov.in/',
    note: 'Search by EPIC number, personal details or mobile number.',
  },
  {
    title: 'Election schedules and press notes',
    href: 'https://www.eci.gov.in/',
    note: 'Official poll dates for every state are announced here.',
  },
];

const FORMS = [
  { form: 'Form 6', use: 'Register for the first time, or after moving to a new constituency' },
  { form: 'Form 6A', use: 'Register as an overseas (NRI) elector' },
  { form: 'Form 7', use: 'Object to, or ask for deletion of, a name on the roll' },
  {
    form: 'Form 8',
    use: 'Correct your details, shift within the constituency, replace your EPIC card or mark yourself as a person with disability',
  },
];

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-300 underline">
      {children}
      <span className="sr-only"> (opens the official site in a new tab)</span>
    </a>
  );
}

export default function VoterInfoPage() {
  return (
    <div className="max-w-3xl mx-auto px-1 py-6 text-sm text-neutral-200 leading-relaxed">
      <h2 className="text-xl font-semibold text-white mb-1">
        Vote: register and find your details
      </h2>
      <p className="text-xs text-neutral-400 mb-5">
        Links go to official Election Commission of India sites. This site is not affiliated with
        the ECI; always follow the official pages. Last reviewed {REVIEWED}.
      </p>

      <section className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">Official links</h3>
        <ul className="space-y-3">
          {LINKS.map((l) => (
            <li key={l.href} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <ExternalLink href={l.href}>{l.title}</ExternalLink>
              <p className="text-xs text-neutral-400 mt-1">{l.note}</p>
            </li>
          ))}
          <li className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <span className="font-medium text-white">Voter helpline: call 1950</span>
            <p className="text-xs text-neutral-400 mt-1">
              Or use the official Voter Helpline app from the ECI.
            </p>
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">
          How to register (first-time voters)
        </h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Check you are eligible.</strong> You must be an Indian citizen, ordinarily
            resident at your address, and 18 or older on a qualifying date: 1 January, 1 April, 1
            July or 1 October. You can apply in advance from age 17.
          </li>
          <li>
            <strong>Keep documents ready.</strong> A recent passport-size photo, proof of age (for
            example a birth certificate or school certificate) and proof of address (for example a
            utility bill, bank passbook or rent agreement).
          </li>
          <li>
            <strong>Fill Form 6</strong> on the{' '}
            <ExternalLink href="https://voters.eci.gov.in/">
              Voters&apos; Service Portal
            </ExternalLink>{' '}
            or the Voter Helpline app, or submit it to your Booth Level Officer (BLO).
          </li>
          <li>
            <strong>Track your application</strong> with the reference number. A BLO may visit to
            verify your address.
          </li>
          <li>
            <strong>Check the roll</strong> on{' '}
            <ExternalLink href="https://electoralsearch.eci.gov.in/">electoral search</ExternalLink>{' '}
            before polling day and note your polling station.
          </li>
        </ol>
      </section>

      <section className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">Which form do I need?</h3>
        <div className="overflow-x-auto">
          <table className="const-grid">
            <thead>
              <tr>
                <th scope="col">Form</th>
                <th scope="col">Use it to</th>
              </tr>
            </thead>
            <tbody>
              {FORMS.map((f) => (
                <tr key={f.form}>
                  <td className="whitespace-nowrap">{f.form}</td>
                  <td>{f.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-neutral-400">
        Rules and portal addresses can change. If anything here differs from the ECI website, the
        ECI website is correct.
      </p>
    </div>
  );
}
