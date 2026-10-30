/** Card wrapper for a chart or table section: heading, optional note, content. */
export default function ChartCard({
  title,
  note,
  className = '',
  children,
}: {
  title: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`glass-card rounded-2xl p-4 md:p-6 ${className}`}>
      <h2 className="font-sans text-base font-semibold tracking-tight text-white md:text-lg">
        {title}
      </h2>
      {note && <p className="text-xs text-neutral-400 mt-1">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
