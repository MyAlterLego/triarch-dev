'use client';

export type FilterType = 'all' | 'fix' | 'feature' | 'other';

interface FilterCounts {
  fix: number;
  feature: number;
  other: number;
  total: number;
}

interface Props {
  active: FilterType;
  counts: FilterCounts;
  onChange: (next: FilterType) => void;
}

interface ChipDef {
  type: FilterType;
  label: string;
  count: number;
}

export default function FilterChips({ active, counts, onChange }: Props) {
  const chips: ChipDef[] = [
    { type: 'all', label: 'All', count: counts.total },
    { type: 'fix', label: 'Bug fixes', count: counts.fix },
    { type: 'feature', label: 'Features', count: counts.feature },
    { type: 'other', label: 'Other', count: counts.other },
  ];

  function handleClick(type: FilterType) {
    if (active !== type) {
      onChange(type);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, type: FilterType) {
    if (e.key === 'Enter') {
      handleClick(type);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {chips.map(({ type, label, count }) => {
        const isActive = active === type;
        const isZero = count === 0;

        const baseClass =
          'px-3 py-1.5 text-sm rounded-full border font-medium transition-colors cursor-pointer';

        const activeClass =
          'border-violet-400 bg-gradient-to-r from-violet-500/10 to-blue-500/10 text-violet-300';

        const inactiveClass =
          'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600';

        const zeroClass = isZero ? 'opacity-50' : '';

        const className = [baseClass, isActive ? activeClass : inactiveClass, zeroClass]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={type}
            type="button"
            role="button"
            aria-pressed={isActive}
            className={className}
            onClick={() => handleClick(type)}
            onKeyDown={(e) => handleKeyDown(e, type)}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}
