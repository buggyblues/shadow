import React, { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: Tab[];
  defaultActive?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultActive,
}) => {
  const [activeTab, setActiveTab] = useState(defaultActive || tabs[0]?.id);
  
  return (
    <div className="flex gap-1 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
            activeTab === tab.id
              ? 'bg-[#00D4FF] text-[#0B0B0F]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
