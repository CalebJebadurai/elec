interface SkeletonProps {
  variant?: 'card' | 'table' | 'chart' | 'header';
  count?: number;
}

function CardSkeleton() {
  return <div className="animate-pulse bg-neutral-800 rounded-xl h-32 mb-3" />;
}

function TableRowSkeleton() {
  return (
    <div className="flex gap-4 py-2">
      <div className="animate-pulse bg-neutral-800 rounded h-4 w-32" />
      <div className="animate-pulse bg-neutral-800 rounded h-4 w-20" />
      <div className="animate-pulse bg-neutral-800 rounded h-4 w-16" />
      <div className="animate-pulse bg-neutral-800 rounded h-4 w-24" />
    </div>
  );
}

function ChartSkeleton() {
  return <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />;
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="animate-pulse bg-neutral-800 rounded h-6 w-64" />
      <div className="animate-pulse bg-neutral-800 rounded h-4 w-48" />
    </div>
  );
}

export default function Skeleton({ variant = 'card', count = 1 }: SkeletonProps) {
  const Component = {
    card: CardSkeleton,
    table: TableRowSkeleton,
    chart: ChartSkeleton,
    header: HeaderSkeleton,
  }[variant];

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} />
      ))}
    </>
  );
}
