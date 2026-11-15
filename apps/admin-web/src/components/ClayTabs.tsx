export interface ClayTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  badge?: string | number;
}

export interface ClayTabsProps<T extends string = string> {
  tabs: ClayTabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  variant?: 'pill' | 'card';
  className?: string;
}

export function ClayTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'pill',
  className = '',
}: ClayTabsProps<T>) {
  if (variant === 'card') {
    return (
      <div className={`flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold select-none ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 border-b-2 font-bold ${
                isActive
                  ? 'bg-white text-[#00506E] border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                  : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60 border-transparent'
              }`}
            >
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-[#CFEAFD] text-[#00506E]' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`p-1.5 bg-[#EDF2F7] rounded-2xl border border-slate-200/80 shadow-[inset_2px_2px_5px_rgba(15,23,42,0.06),inset_-2px_-2px_5px_rgba(255,255,255,0.85)] inline-flex flex-wrap gap-1.5 select-none ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 ${
              isActive
                ? 'bg-white text-[#00506E] shadow-[0_4px_12px_rgba(0,80,110,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(0,0,0,0.04)] transform -translate-y-0.5'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.icon && <span className="text-sm">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-[#CFEAFD] text-[#00506E]' : 'bg-slate-300/80 text-slate-700'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
