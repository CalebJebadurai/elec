export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <h2>Privacy Policy</h2>
      <p className="legal-updated">Last updated: 28 April 2026</p>

      <section>
        <h3>1. Data Fiduciary</h3>
        <p>
          This platform ("Election Analytics") is operated as an independent analytics service. For
          privacy-related queries, contact us via the repository linked in the footer.
        </p>
      </section>

      <section>
        <h3>2. Personal Data We Collect</h3>
        <p>When you create an account, we collect the following personal data:</p>
        <ul>
          <li>
            <strong>Mobile number</strong> — used as your primary login identifier via Firebase
            Phone Auth.
          </li>
          <li>
            <strong>Display name</strong> — defaults to "Analyst"; you may change it at any time.
          </li>
          <li>
            <strong>Google account details</strong> (optional) — Google ID, email address, and
            avatar URL, collected only if you choose to link a Google account.
          </li>
          <li>
            <strong>Date of birth</strong> (optional) — retrieved from your Google profile if you
            link a Google account and grant access.
          </li>
        </ul>
        <p>
          We also store data you create on the platform: prediction bookmarks, votes on community
          predictions, and associated timestamps.
        </p>
      </section>

      <section>
        <h3>3. Purpose of Data Collection</h3>
        <p>Your personal data is processed for the following purposes:</p>
        <ul>
          <li>
            <strong>Authentication</strong> — to verify your identity and provide secure access to
            your account.
          </li>
          <li>
            <strong>Service delivery</strong> — to save your prediction bookmarks, display your
            contributions in community feeds, and personalise your experience.
          </li>
          <li>
            <strong>Service improvement</strong> — aggregated, anonymised usage data helps us
            understand how the platform is used and improve it.
          </li>
        </ul>
      </section>

      <section>
        <h3>4. Legal Basis for Processing</h3>
        <p>
          We process your personal data based on your explicit consent, provided at the time of
          registration. You may withdraw consent at any time by deleting your account.
        </p>
      </section>

      <section>
        <h3>5. Data Retention</h3>
        <p>
          Your personal data is retained for as long as your account is active. If you delete your
          account, all personal data and associated content (bookmarks, votes) are permanently
          deleted within 24 hours. Anonymised, aggregated analytics data may be retained
          indefinitely.
        </p>
      </section>

      <section>
        <h3>6. Your Rights Under the Digital Personal Data Protection Act 2023</h3>
        <p>As a data principal, you have the following rights:</p>
        <ul>
          <li>
            <strong>Right to access</strong> — you may request a copy of all personal data we hold
            about you.
          </li>
          <li>
            <strong>Right to correction</strong> — you may update your display name and other
            profile information at any time.
          </li>
          <li>
            <strong>Right to erasure</strong> — you may delete your account, which permanently
            removes all personal data.
          </li>
          <li>
            <strong>Right to grievance redressal</strong> — if you have concerns about how your data
            is handled, contact us via the repository.
          </li>
        </ul>
      </section>

      <section>
        <h3>7. Data Sharing</h3>
        <p>
          We do not sell, rent, or share your personal data with third parties, except as required
          by law or to the extent necessary to operate the service (e.g., Firebase for
          authentication).
        </p>
      </section>

      <section>
        <h3>8. Cookies and Tracking</h3>
        <p>
          This platform uses essential cookies for authentication. We use privacy-respecting
          analytics (no personal data collection, no cross-site tracking). No cookie consent banner
          is required as we do not use advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h3>9. Security</h3>
        <p>
          We implement appropriate technical and organisational measures to protect your personal
          data, including encrypted connections (TLS), secure token storage, and access controls.
        </p>
      </section>

      <section>
        <h3>10. Changes to This Policy</h3>
        <p>
          We may update this privacy policy from time to time. Material changes will be communicated
          via a notice on the platform. Continued use of the service after changes constitutes
          acceptance.
        </p>
      </section>

      <section>
        <h3>11. Governing Law</h3>
        <p>
          This privacy policy is governed by and construed in accordance with the laws of India,
          including the Digital Personal Data Protection Act 2023.
        </p>
      </section>
    </div>
  );
}
