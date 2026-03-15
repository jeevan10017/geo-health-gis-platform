
import React from 'react';
import { Navigation, Clock, Star, Banknote, LayoutGrid } from 'lucide-react';

const MODES = [
    { id: null,       label: 'Nearest',   Icon: LayoutGrid,  title: 'Sort by road distance'       },
    { id: 'fastest',  label: 'Fastest',   Icon: Navigation,  title: 'Sort by travel time'          },
    { id: 'wait',     label: 'Least Wait',Icon: Clock,       title: 'Sort by avg. wait time'       },
    { id: 'rating',   label: 'Top Rated', Icon: Star,        title: 'Sort by hospital rating'      },
    { id: 'cheapest', label: 'Cheapest',  Icon: Banknote,    title: 'Sort by cost (lowest first)'  },
];

const DecisionModeBar = ({ activeMode, onModeChange }) => (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {MODES.map(({ id, label, Icon, title }) => {
            const isActive = activeMode === id;
            return (
                <button
                    key={String(id)}
                    title={title}
                    onClick={() => onModeChange(id)}
                    className={`
                        flex items-center gap-1.5 flex-shrink-0
                        px-3 py-1.5 rounded-full text-xs font-semibold
                        border transition-all duration-150
                        ${isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'}
                    `}
                >
                    <Icon size={13} />
                    {label}
                </button>
            );
        })}
    </div>
);

export default DecisionModeBar;