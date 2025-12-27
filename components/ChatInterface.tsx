
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ArrowUp, StopCircle, X, Pencil, RotateCw, Check, Sparkles, Paperclip, Plus, Quote, Image } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  activeToolCall?: string | null;
  onSendMessage: (text: string, attachment?: string) => void;
  onEditMessage?: (id: string, newText: string) => void;
  onRegenerate?: () => void;
  onStop: () => void;
  isDisabled: boolean;
  pendingAttachment: string | null; // base64 image
  onClearAttachment: () => void;
  onSetAttachment?: (data: string) => void; // New prop for manually setting attachment
  quotedText: string | null;
  onQuoteConsumed: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  isLoading,
  activeToolCall,
  onSendMessage,
  onEditMessage,
  onRegenerate,
  onStop,
  isDisabled,
  pendingAttachment,
  onClearAttachment,
  onSetAttachment,
  quotedText,
  onQuoteConsumed
}) => {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  
  // State to track dynamic height of the footer
  const [footerHeight, setFooterHeight] = useState(0);
  
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLDivElement>(null); // Ref for the floating input area

  // Filter out system messages for display
  const displayMessages = messages.filter(m => m.role !== 'system');

  const scrollToBottom = useCallback(() => {
    if (!editingId && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
            index: displayMessages.length - 1,
            behavior: 'smooth',
            align: 'end'
        });
    }
  }, [editingId, displayMessages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, pendingAttachment, isLoading, footerHeight, activeQuote, scrollToBottom]); 

  // Handle quoted text insertion
  useEffect(() => {
    if (quotedText) {
        setActiveQuote(quotedText);
        onQuoteConsumed();
        // Focus textarea to let user start typing immediately
        textareaRef.current?.focus();
    }
  }, [quotedText, onQuoteConsumed]);

  // Auto-resize input textarea
  useLayoutEffect(() => {
    if (textareaRef.current) {
        // Reset height to base height to get correct scrollHeight
        textareaRef.current.style.height = 'auto';
        
        // Calculate the new height, capping at 200px
        const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
        
        // Apply the new height
        textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Dynamically measure footer height
  useLayoutEffect(() => {
    if (!footerRef.current) return;

    const updateHeight = () => {
        if (footerRef.current) {
            setFooterHeight(footerRef.current.offsetHeight);
        }
    };

    // Initial measure
    updateHeight();

    // Observe changes
    const observer = new ResizeObserver(updateHeight);
    observer.observe(footerRef.current);

    return () => observer.disconnect();
  }, [activeQuote, pendingAttachment]); // Re-measure when these UI elements appear/disappear

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !pendingAttachment && !activeQuote) return;
    
    let finalMessage = input;
    
    // Prepend quote if exists
    if (activeQuote) {
        const formattedQuote = activeQuote.split('\n').map(line => `> ${line}`).join('\n');
        finalMessage = `${formattedQuote}\n\n${input}`;
    }

    onSendMessage(finalMessage, pendingAttachment || undefined);
    setInput('');
    setActiveQuote(null);
  };

  const handleStartEdit = (msg: Message) => {
      setEditingId(msg.id);
      setEditText(msg.content);
      setTimeout(() => {
          if (editAreaRef.current) {
              editAreaRef.current.style.height = 'auto';
              editAreaRef.current.style.height = editAreaRef.current.scrollHeight + 'px';
              editAreaRef.current.focus();
          }
      }, 0);
  };

  const handleSaveEdit = (id: string) => {
      if (onEditMessage && editText.trim()) {
          onEditMessage(id, editText);
          setEditingId(null);
      }
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setEditText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
              e.preventDefault();
              const file = items[i].getAsFile();
              if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                      if (typeof reader.result === 'string' && onSetAttachment) {
                          onSetAttachment(reader.result);
                      }
                  };
                  reader.readAsDataURL(file);
              }
              return; // Stop after finding the first image
          }
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          if (typeof reader.result === 'string' && onSetAttachment) {
              onSetAttachment(reader.result);
          }
      };
      reader.readAsDataURL(file);
      
      // Reset input value to allow selecting same file again
      e.target.value = '';
  };

  const triggerFileUpload = () => {
      fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Messages Area - Virtual Scroll */}
      <div 
        className="flex-1 overflow-hidden relative"
        style={{ paddingBottom: footerHeight ? `${footerHeight}px` : '160px' }}
      >
        {/* Embossed Logo Background - shows when no messages */}
        {displayMessages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ marginTop: '-80px' }}>
            <div className="flex flex-col items-center gap-4 opacity-[0.05]">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-900">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13h6" />
                <path d="M9 17h6" />
              </svg>
              <span className="text-6xl font-bold tracking-tight text-zinc-900">ChatPDF</span>
            </div>
          </div>
        )}
        <Virtuoso
          ref={virtuosoRef}
          data={displayMessages}
          followOutput="smooth"
          initialTopMostItemIndex={displayMessages.length - 1}
          className="h-full"
          itemContent={(index, msg) => {
            const isEditing = editingId === msg.id;
            const isLastModelMessage = msg.role === 'model' && index === displayMessages.length - 1;
            const isUser = msg.role === 'user';

            return (
                <div className="group w-full px-4 md:px-6 py-3">
                    <div
                    className={`relative w-full rounded-2xl px-5 py-4 text-base shadow-sm border ${
                        isUser
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-zinc-800 border-zinc-100'
                    }`}
                    >
                        {/* Edit Mode */}
                        {isEditing ? (
                             <div className="w-full">
                                <textarea
                                    ref={editAreaRef}
                                    value={editText}
                                    onChange={(e) => {
                                        setEditText(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    className="w-full p-2 bg-white/10 border border-white/30 rounded-lg outline-none resize-none text-inherit placeholder-white/50"
                                    rows={3}
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md transition-colors">
                                        取消
                                    </button>
                                    <button onClick={() => handleSaveEdit(msg.id)} className="px-3 py-1.5 text-xs bg-white text-blue-600 font-bold rounded-md hover:bg-blue-50 flex items-center gap-1 transition-colors">
                                        <Check size={12} /> 保存
                                    </button>
                                </div>
                             </div>
                        ) : (
                            <>
                                {/* Avatar/Label for Model */}
                                {!isUser && (
                                    <div className="flex items-center gap-2 mb-2 select-none opacity-80">
                                        <Sparkles size={14} className="text-blue-500" />
                                        <span className="font-bold text-xs bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600">Gemini AI</span>
                                    </div>
                                )}

                                {/* Attachments */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mb-3">
                                        <img 
                                            src={msg.attachments[0].data} 
                                            alt="Context" 
                                            className="max-h-60 rounded-xl border border-white/20 shadow-sm"
                                            loading="lazy"
                                        />
                                    </div>
                                )}

                                {/* Message Content */}
                                <div className={`prose prose-base max-w-none dark:prose-invert leading-7 ${isUser ? 'prose-invert' : ''} prose-code:before:content-none prose-code:after:content-none`}>
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeHighlight, rehypeKatex]}
                                        components={{
                                            // 1. Block Code Container (PRE)
                                            pre: ({children}) => (
                                                <div className="rounded-xl bg-[#1e1e2e] my-4 overflow-hidden border border-white/10 shadow-inner group-code relative">
                                                    <div className="p-4 overflow-x-auto">
                                                        <pre className="m-0 p-0 bg-transparent text-sm font-mono text-zinc-200 leading-relaxed font-normal">
                                                            {children}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ),

                                            // 2. Code Element (Inline & Block)
                                            code: ({node, inline, className, children, ...props}: any) => {
                                                if (inline) {
                                                    return (
                                                        <code 
                                                            className={`font-mono text-sm px-1.5 py-0.5 rounded border align-middle break-words whitespace-pre-wrap ${
                                                                isUser 
                                                                  ? 'bg-white/20 text-white border-white/20' 
                                                                  : 'bg-zinc-100 text-pink-600 border-zinc-200'
                                                            }`} 
                                                            {...props}
                                                        >
                                                            {children}
                                                        </code>
                                                    );
                                                }
                                                return (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            },
                                            
                                            a: ({node, ...props}) => <a {...props} className={`underline underline-offset-2 ${isUser ? 'text-white hover:text-blue-100' : 'text-blue-600 hover:text-blue-700'}`} target="_blank" rel="noopener noreferrer" />,
                                            blockquote: ({node, ...props}) => <blockquote {...props} className={`border-l-4 pl-4 italic my-2 ${isUser ? 'border-white/40' : 'border-blue-200 bg-blue-50/50 py-1 pr-2 rounded-r'}`} />
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>

                                {/* Action Buttons */}
                                {!isLoading && onEditMessage && (
                                    <div className={`absolute -bottom-8 ${isUser ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1`}>
                                        <button 
                                            onClick={() => handleStartEdit(msg)}
                                            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                                            title="编辑"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        {isLastModelMessage && onRegenerate && (
                                            <button 
                                                onClick={onRegenerate}
                                                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
                                                title="重新生成"
                                            >
                                                <RotateCw size={14} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            );
          }}
          components={{
            Footer: () => isLoading ? (
              <div className="flex flex-col gap-2 w-full px-4 md:px-6 py-3 animate-in fade-in duration-300">
                   {activeToolCall && (
                     <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                             <Image size={10} className="text-white" />
                          </div>
                          <span className="text-sm text-purple-700 font-medium">🎨 正在调用图像生成工具...</span>
                     </div>
                   )}
                   <div className="bg-white border border-zinc-100 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center animate-spin">
                           <RotateCw size={10} className="text-white" />
                        </div>
                        <span className="text-sm text-zinc-500 font-medium">{activeToolCall ? '生成图片中...' : 'AI 思考中...'}</span>
                   </div>
              </div>
            ) : null
          }}
        />
      </div>

      {/* Floating Input Area */}
      <div 
        ref={footerRef}
        className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-white via-white to-transparent pt-12"
      >
        
        {/* Quote Badge */}
        {activeQuote && (
             <div className="mx-auto max-w-3xl mb-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
                <div className="flex items-start gap-3 p-3.5 bg-zinc-50/95 backdrop-blur-sm border border-zinc-200 rounded-xl shadow-sm relative group">
                    <div className="shrink-0 mt-0.5 p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                        <Quote size={14} className="fill-current" />
                    </div>
                    <div className="flex-1 min-w-0 mr-6">
                        <div className="text-xs font-bold text-zinc-500 mb-1 flex items-center gap-2">
                            引用内容
                        </div>
                        <div className="text-sm text-zinc-700 italic border-l-2 border-zinc-300 pl-3 py-0.5 line-clamp-3 leading-relaxed">
                            {activeQuote}
                        </div>
                    </div>
                    <button 
                        onClick={() => setActiveQuote(null)}
                        className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-200/50 rounded-full transition-colors"
                        title="移除引用"
                    >
                        <X size={16} />
                    </button>
                </div>
             </div>
        )}

        {/* Attachment Badge */}
        {pendingAttachment && (
            <div className="mx-auto max-w-3xl flex items-center gap-3 mb-3 p-2 pl-3 bg-white/95 backdrop-blur border border-blue-100 rounded-xl w-fit shadow-lg shadow-blue-500/5 animate-in slide-in-from-bottom-2">
                <div className="relative">
                    <img src={pendingAttachment} className="h-10 w-10 rounded-lg object-cover ring-2 ring-white" alt="Preview" />
                    <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border-2 border-white">
                        <Paperclip size={8} className="text-white" />
                    </div>
                </div>
                <div className="flex flex-col pr-8">
                    <span className="text-xs font-bold text-zinc-700">附件已添加</span>
                    <span className="text-[10px] text-zinc-400">将作为上下文发送</span>
                </div>
                <button 
                    onClick={onClearAttachment}
                    className="absolute top-1 right-1 p-1 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl relative transition-all group">
            <div className={`absolute inset-0 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl blur-xl opacity-20 group-focus-within:opacity-40 transition-opacity duration-500 ${isLoading ? 'animate-pulse' : ''}`}></div>
            
            {/* Main Input Container */}
            <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus-within:shadow-[0_8px_30px_rgba(59,130,246,0.1)] focus-within:border-blue-200 transition-all overflow-hidden p-4 flex flex-col gap-2">
                
                {/* 1. Top: Textarea */}
                <div 
                    className="flex-1 min-h-[40px] cursor-text"
                    onClick={() => textareaRef.current?.focus()}
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={isDisabled ? "请上传 PDF 以开始聊天..." : "询问任何问题，支持粘贴图片 (Shift+Enter 换行)..."}
                        className="w-full resize-none outline-none text-[15px] bg-transparent text-zinc-800 placeholder:text-zinc-400 leading-relaxed scrollbar-hide px-1"
                        rows={1}
                        disabled={isDisabled}
                        style={{ height: 'auto', minHeight: '24px' }}
                    />
                </div>

                {/* 2. Bottom: Toolbar (Right Aligned) */}
                <div className="flex items-center justify-end gap-2 pt-1">
                    
                    {/* Attachment Input (Hidden) */}
                    <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleImageUpload}
                    />
                    
                    {/* Plus Button (Upload) */}
                    <button 
                        type="button"
                        onClick={triggerFileUpload}
                        disabled={isDisabled}
                        className="flex items-center justify-center h-8 w-8 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-all active:scale-95 disabled:opacity-50"
                        title="上传图片"
                    >
                        <Plus size={20} />
                    </button>

                    {/* Send/Stop Button */}
                    <div className="flex-shrink-0">
                        {isLoading ? (
                            <button 
                                type="button" 
                                onClick={onStop}
                                className="flex items-center justify-center h-8 w-8 bg-zinc-900 rounded-full text-white hover:bg-zinc-700 transition-all hover:scale-105 active:scale-95 shadow-sm"
                            >
                                <StopCircle size={16} />
                            </button>
                        ) : (
                            <button 
                                type="submit" 
                                disabled={(!input.trim() && !pendingAttachment && !activeQuote) || isDisabled}
                                className="flex items-center justify-center h-8 w-8 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:bg-zinc-200 shadow-md shadow-blue-500/20"
                            >
                                <ArrowUp size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="text-center mt-3">
                <p className="text-[10px] font-medium text-zinc-400 tracking-wide">AI 可能会犯错，请核对重要信息。</p>
            </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
