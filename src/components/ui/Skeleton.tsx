'use client';

type SkeletonProps = {
  lines?: number;
  className?: string;
};

export function Skeleton({ lines = 3, className }: SkeletonProps) {
  return (
    <div className={['skeleton', className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <span
          key={`skeleton-line-${index}`}
          className="skeleton-line"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}
