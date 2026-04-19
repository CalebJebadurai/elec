import { useState } from 'react';

export default function Disclaimer() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('disclaimer_dismissed') === 'true'
  );

  if (dismissed) return null;

  return (
    <div className="disclaimer-banner">
      <div className="disclaimer-content">
        <strong>⚠ Disclaimer:</strong> These predictions are mathematical simulations based on
        historical patterns and user-adjustable parameters. They <em>do not</em> forecast
        actual election outcomes. Results depend on alliance dynamics, candidate selection, local
        issues, campaign effectiveness, and many other factors not captured here. Use for
        analytical exploration only.
      </div>
      <button
        className="disclaimer-close"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem('disclaimer_dismissed', 'true');
        }}
      >
        Understood
      </button>
    </div>
  );
}
