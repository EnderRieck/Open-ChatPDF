
import React from 'react';
import { MessageSquare, Plus, ChevronLeft, ChevronRight, Trash2, Settings, Sparkles } from 'lucide-react';
import { ChatSession } from '../types';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  toggleSidebar,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings
}) => {
  return (
    <div 
      className={`relative h-full bg-zinc-50/80 backdrop-blur-xl flex flex-col transition-all duration-300 ease-in-out z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] ${isOpen ? 'w-72 border-r border-zinc-200' : 'w-0'}`}
    >
      {/* Toggle Button - Vertically centered handle style */}
      <button 
        onClick={toggleSidebar}
        className={`absolute top-1/2 -translate-y-1/2 z-50 flex items-center justify-center bg-white border border-zinc-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 text-zinc-400
          ${isOpen 
            ? '-right-3 w-6 h-16 rounded-full' 
            : '-right-6 w-6 h-12 rounded-r-lg border-l-0'
          }`}
        title={isOpen ? "收起侧边栏" : "展开侧边栏"}
      >
        {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className={`${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'} transition-all duration-300 flex flex-col h-full overflow-hidden`}>
        
        {/* Header / Brand */}
        <div className="p-5 pb-2">
            <div className="flex items-center gap-2 mb-6 text-zinc-800 font-bold text-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <Sparkles size={16} />
                </div>
                <span>Chat PDF</span>
            </div>

            <button
                onClick={onNewSession}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-zinc-200 hover:border-blue-300 hover:shadow-md hover:text-blue-600 text-zinc-600 rounded-xl transition-all font-medium text-sm group"
            >
                <Plus size={18} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
                开启新对话
            </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hide">
          <div className="px-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 mt-2">历史记录</div>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group relative flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 border border-transparent ${
                currentSessionId === session.id 
                  ? 'bg-white text-zinc-900 shadow-sm border-zinc-100 ring-1 ring-black/5' 
                  : 'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900'
              }`}
            >
              <MessageSquare size={18} className={`shrink-0 ${currentSessionId === session.id ? 'text-blue-500' : 'text-zinc-400'}`} />
              <div className="flex-1 truncate min-w-0">
                <div className="truncate text-sm font-medium">{session.title || '未命名对话'}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                    {new Date(session.lastUpdated).toLocaleDateString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                </div>
              </div>
              <button 
                onClick={(e) => onDeleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all absolute right-2"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          
          {sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-400 text-sm">
                <span className="opacity-50">暂无记录</span>
            </div>
          )}
        </div>
        
        {/* Footer / Settings */}
        <div className="p-4 border-t border-zinc-100 bg-white/50">
            <button 
                onClick={onOpenSettings}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 transition-colors text-zinc-600 text-sm font-medium"
            >
                <Settings size={18} />
                <span>设置</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
