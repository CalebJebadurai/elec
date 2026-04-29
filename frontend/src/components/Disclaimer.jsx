import { useState } from 'react';

export default function Disclaimer() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('disclaimer_dismissed') === 'true'
  );

  if (dismissed) return null;

  return (
    <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="text-xs text-neutral-200 leading-relaxed">
        <strong>⚠ Disclaimer:</strong> These predictions are mathematical simulations based on
        historical patterns and user-adjustable parameters. They <em>do not</em> forecast actual
        election outcomes. Results depend on alliance dynamics, candidate selection, local issues,
        campaign effectiveness, and many other factors not captured here. Use for analytical
        exploration only.
      </div>
      <button
        className="bg-warning/20 text-warning text-xs px-4 py-2 rounded-md hover:bg-warning/30 transition-colors cursor-pointer whitespace-nowrap min-h-[44px] md:min-h-0"
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
