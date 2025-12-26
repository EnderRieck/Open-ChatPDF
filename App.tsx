
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, HardDrive, AlertTriangle } from 'lucide-react';
import Sidebar from './components/Sidebar';
import PDFViewer from './components/PDFViewer';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';
import { AppSettings, ChatSession, Message, StorageType } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { geminiService } from './services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { 
  saveSessionsToLocal, 
  loadSessionsFromLocal, 
  saveFileToDB, 
  getFileFromDB, 
  deleteFileFromDB,
  saveDirectoryHandle,
  getDirectoryHandle,
  verifyPermission,
  loadFromDirectory,
  saveSessionToDirectory,
  saveSettingsToDirectory,
  deleteSessionFromDirectory
} from './utils/storage';

const App: React.FC = () => {
  // --- State ---
  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  
  // Data
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Storage Refs
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false); // To show a banner if permission needed

  // PDF
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [pdfSummary, setPdfSummary] = useState<string>('');
  const [pdfDimensions, setPdfDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Chat
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<string | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // --- Initialization Logic ---

  // 1. Initial Load (Browser Mode or Check Dir Handle)
  useEffect(() => {
    const init = async () => {
      // A. Load Settings first to know preference
      const savedSettingsStr = localStorage.getItem('ai-pdf-settings');
      let initialSettings = DEFAULT_SETTINGS;
      if (savedSettingsStr) {
        initialSettings = JSON.parse(savedSettingsStr);
        setSettings(initialSettings);
      }

      // B. Branch based on Storage Type
      if (initialSettings.storageType === 'local') {
        // Local Mode: Try to get handle
        try {
            const handle = await getDirectoryHandle();
            if (handle) {
                dirHandleRef.current = handle;
                
                // Check Permission immediately
                const hasPerm = await verifyPermission(handle, false); // Just read check first
                if (hasPerm) {
                    await reloadFromDirectory(handle);
                } else {
                    // Update settings to at least show the directory name if we have the handle
                    setSettings(prev => ({ ...prev, localDirectoryName: handle.name }));
                    setNeedsPermission(true);
                }
            }
        } catch (e) {
            console.error("FS Init Error", e);
        }
      } else {
        // Browser Mode: Load from IDB/Local
        const loadedSessions = loadSessionsFromLocal();
        setSessions(loadedSessions);
        
        const lastId = localStorage.getItem('ai-pdf-last-session-id');
        if (loadedSessions.length === 0) {
            createNewSession();
        } else if (lastId && loadedSessions.find(s => s.id === lastId)) {
            handleSelectSession(lastId, loadedSessions);
        } else {
            handleSelectSession(loadedSessions[0].id, loadedSessions);
        }
      }
    };
    init();
  }, []);

  // Sync Service
  useEffect(() => {
    try {
        geminiService.initialize(settings);
    } catch (e) {
        console.warn("Gemini Service init warning:", e);
    }
  }, [settings]);

  // --- Helpers for Storage Abstraction ---

  const reloadFromDirectory = async (handle: FileSystemDirectoryHandle) => {
      try {
          const { sessions: fsSessions, settings: fsSettings } = await loadFromDirectory(handle);
          setSessions(fsSessions);
          
          // Merge loaded settings with current state and ensure directory name is up to date from handle
          // This ensures that if the user moved the folder (unlikely to work with same handle) or renamed it, we update.
          if (fsSettings) {
             setSettings({ 
                 ...fsSettings, 
                 storageType: 'local',
                 localDirectoryName: handle.name
             }); 
          } else {
              // No settings file yet, just update the name
              setSettings(prev => ({ ...prev, localDirectoryName: handle.name }));
          }

          setNeedsPermission(false);

          // Select Session
          if (fsSessions.length > 0) {
              handleSelectSession(fsSessions[0].id, fsSessions);
          } else {
              createNewSession();
          }
      } catch (e) {
          console.error("Error loading directory", e);
      }
  };

  const persistSession = async (session: ChatSession) => {
      if (settings.storageType === 'local' && dirHandleRef.current) {
          await saveSessionToDirectory(dirHandleRef.current, session);
      } else {
          // Browser Mode
          // We trigger saveSessionsToLocal in a separate effect usually, but we can do it here for specific session updates if we want immediate sync
          // The effect [sessions] handles the batch save for localStorage
          if (session.file) {
              await saveFileToDB(session.id, session.file);
          }
      }
  };

  const persistSettings = async (newSettings: AppSettings) => {
      if (newSettings.storageType === 'local' && dirHandleRef.current) {
          await saveSettingsToDirectory(dirHandleRef.current, newSettings);
      }
      localStorage.setItem('ai-pdf-settings', JSON.stringify(newSettings));
  };

  // --- Auto-save Effect for Browser Mode (LocalStorage) ---
  useEffect(() => {
      if (settings.storageType === 'browser') {
          saveSessionsToLocal(sessions);
      }
  }, [sessions, settings.storageType]);


  // --- Resizing Logic ---
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handlePageDimensions = useCallback((width: number, height: number) => {
      setPdfDimensions({ width, height });
  }, []);

  const resize = useCallback(
    (mouseEvent: MouseEvent) => {
      if (isResizing) {
        let newWidth = window.innerWidth - mouseEvent.clientX;
        
        // Base limits
        const minChatWidth = 320;
        let maxChatWidth = window.innerWidth * 0.85; // Fallback max

        // Dynamic calculation based on PDF 10% scale constraint
        if (pdfDimensions && pdfDimensions.width > 0) {
            // Sidebar is 288px (w-72), plus maybe border. Use 290 for safety.
            const sidebarW = sidebarOpen ? 288 : 0;
            
            // We need: PDF Container Width >= (PDF Width * 0.1) + Padding(60)
            const minPdfContainerWidth = (pdfDimensions.width * 0.1) + 60; 
            
            // Total space available for (PDF Container + Chat)
            // Note: resizer width is negligible (1px in DOM layout usually overlays or is tiny)
            const availableSpace = window.innerWidth - sidebarW;
            
            // Maximum width the chat can take while leaving enough room for PDF
            const calculatedMaxChatWidth = availableSpace - minPdfContainerWidth;
            
            // Ensure we don't block the user from shrinking chat, but we block expansion
            // However, calculatedMaxChatWidth could be less than minChatWidth if screen is tiny
            // In that case, we prioritize minChatWidth and let PDF hide/overflow, 
            // but the prompt asked to limit chat expansion.
            
            maxChatWidth = Math.max(minChatWidth, calculatedMaxChatWidth);
        }

        if (newWidth > maxChatWidth) newWidth = maxChatWidth;
        if (newWidth < minChatWidth) newWidth = minChatWidth;
        
        setChatWidth(newWidth);
      }
    },
    [isResizing, pdfDimensions, sidebarOpen]
  );

  useEffect(() => {
    if (isResizing) {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        document.body.style.cursor = 'col-resize';
    } else {
        document.body.style.cursor = '';
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = '';
    };
  }, [isResizing, resize, stopResizing]);


  // --- Handlers ---

  const requestPermission = async () => {
      if (dirHandleRef.current) {
          const granted = await verifyPermission(dirHandleRef.current, true);
          if (granted) {
              reloadFromDirectory(dirHandleRef.current);
          }
      }
  };

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: '新对话',
      messages: [],
      lastUpdated: Date.now(),
      file: undefined,
      summary: ''
    };
    
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setPdfSummary('');
    setCurrentFile(null);
    setPdfDimensions(null);
    
    // Persist immediately? For FS mode, maybe wait until first message/file
    // But to show up in list, we might want to save
    if (settings.storageType === 'local') {
        persistSession(newSession);
    }
  };

  const handleSelectSession = async (id: string, sessionList = sessions) => {
    setCurrentSessionId(id);
    localStorage.setItem('ai-pdf-last-session-id', id);

    const session = sessionList.find(s => s.id === id);
    if (session) {
        setPdfSummary(session.summary || '');
        setPendingAttachment(null);
        
        if (window.innerWidth < 768) setSidebarOpen(false);

        // File Loading Logic
        if (session.file) {
            setCurrentFile(session.file);
        } else if (session.pdfName) {
            // Need to fetch file
            setCurrentFile(null);
            if (settings.storageType === 'browser') {
                try {
                    const file = await getFileFromDB(id);
                    if (file) {
                        setCurrentFile(file);
                        setSessions(prev => prev.map(s => s.id === id ? { ...s, file } : s));
                    }
                } catch (e) { console.error(e); }
            } 
            // For Local mode, the file should have been loaded during loadFromDirectory if possible
        } else {
            setCurrentFile(null);
        }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCurrentFile(file);
    setPdfSummary('');
    setPdfDimensions(null); // Reset dimensions for new file
    
    if (currentSessionId) {
        const updatedSession = sessions.find(s => s.id === currentSessionId);
        if (updatedSession) {
            const newSession = { 
                ...updatedSession, 
                title: file.name, 
                pdfName: file.name,
                file: file, 
                summary: '' 
            };
            
            setSessions(prev => prev.map(s => s.id === currentSessionId ? newSession : s));
            
            // Persist
            persistSession(newSession);
        }
    }
  };

  const handleTextExtracted = async (text: string) => {
    if (!text) return;
    
    let summary = text.substring(0, 5000); 

    if (settings.apiKey || process.env.API_KEY) {
        const generatedSummary = await geminiService.generateSummary(text);
        summary = generatedSummary;
        
        addMessageToCurrentSession({
            id: uuidv4(),
            role: 'system',
            content: `**PDF 分析完成**\n\n摘要: ${generatedSummary}\n\n你现在可以针对此文档提问了。`,
            timestamp: Date.now()
        });
    }

    setPdfSummary(summary);
    
    if (currentSessionId) {
        setSessions(prev => {
            const next = prev.map(s => s.id === currentSessionId ? { ...s, summary: summary } : s);
            const newSession = next.find(s => s.id === currentSessionId);
            if (newSession && settings.storageType === 'local') persistSession(newSession);
            return next;
        });
    }
  };

  const addMessageToCurrentSession = (msg: Message) => {
    if (!currentSessionId) return;
    setSessions(prev => {
        const next = prev.map(s => {
            if (s.id === currentSessionId) {
                return { ...s, messages: [...s.messages, msg], lastUpdated: Date.now() };
            }
            return s;
        });
        // Fire and forget persist for local mode
        const newSession = next.find(s => s.id === currentSessionId);
        if (newSession && settings.storageType === 'local') persistSession(newSession);
        return next;
    });
  };

  const runChatStream = async (sessionId: string, messagesToProcess: Message[]) => {
      setIsLoading(true);
      try {
          let fullResponse = "";
          const responseId = uuidv4();
          
          // Optimistic update for UI
          setSessions(prev => prev.map(s => {
              if (s.id === sessionId) {
                  return { 
                      ...s, 
                      messages: [...messagesToProcess, {
                          id: responseId,
                          role: 'model',
                          content: '',
                          timestamp: Date.now()
                      }],
                      lastUpdated: Date.now() 
                  };
              }
              return s;
          }));
  
          const session = sessions.find(s => s.id === sessionId);
          const contextToUse = session?.summary || pdfSummary;

          const stream = geminiService.streamChat(messagesToProcess, contextToUse);
          
          for await (const chunk of stream) {
              fullResponse += chunk;
              setSessions(prev => prev.map(s => {
                  if (s.id === sessionId) {
                      const newMsgs = [...s.messages];
                      const lastMsgIndex = newMsgs.findIndex(m => m.id === responseId);
                      if (lastMsgIndex !== -1) {
                          newMsgs[lastMsgIndex] = { ...newMsgs[lastMsgIndex], content: fullResponse };
                      }
                      return { ...s, messages: newMsgs };
                  }
                  return s;
              }));
          }

          // Final Persist after stream complete
          const finalSessions = await new Promise<ChatSession[]>(resolve => setSessions(prev => {
              resolve(prev);
              return prev;
          }));
          const finalSession = finalSessions.find(s => s.id === sessionId);
          if (finalSession && settings.storageType === 'local') {
              persistSession(finalSession);
          }

      } catch (error) {
          console.error("Chat error", error);
          setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, messages: [...s.messages, {
                    id: uuidv4(),
                    role: 'system',
                    content: "AI 通信错误，请检查设置。",
                    timestamp: Date.now()
                }] };
            }
            return s;
        }));
      } finally {
          setIsLoading(false);
      }
  };

  const handleSendMessage = async (text: string, attachment?: string) => {
    if (!currentSessionId) return;

    const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        attachments: attachment ? [{ type: 'image', data: attachment }] : undefined
    };
    
    addMessageToCurrentSession(userMsg);
    setPendingAttachment(null);

    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession) return;
    
    const history = [...currentSession.messages, userMsg];
    await runChatStream(currentSessionId, history);
  };

  // ... (Edit/Regenerate omitted for brevity, logic follows same pattern of updating state then persistSession)
  const handleEditMessage = async (id: string, newText: string) => {
    if (!currentSessionId) return;
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession) return;
    const msgIndex = currentSession.messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;
    
    const targetMsg = currentSession.messages[msgIndex];
    let newHistory: Message[] = [];

    if (targetMsg.role === 'model') {
        const updatedMsg = { ...targetMsg, content: newText };
        setSessions(prev => {
            const next = prev.map(s => {
                if (s.id === currentSessionId) {
                    const newMsgs = [...s.messages];
                    newMsgs[msgIndex] = updatedMsg;
                    return { ...s, messages: newMsgs };
                }
                return s;
            });
            if (settings.storageType === 'local') persistSession(next.find(s => s.id === currentSessionId)!);
            return next;
        });
    } else {
        const prevMessages = currentSession.messages.slice(0, msgIndex);
        const updatedMsg: Message = { ...targetMsg, content: newText };
        newHistory = [...prevMessages, updatedMsg];
        
        setSessions(prev => {
            const next = prev.map(s => {
                if (s.id === currentSessionId) {
                    return { ...s, messages: newHistory };
                }
                return s;
            });
            return next;
        });
        await runChatStream(currentSessionId, newHistory);
    }
  };

  const handleRegenerate = async () => {
    if (!currentSessionId) return;
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession || currentSession.messages.length === 0) return;
    const lastMsg = currentSession.messages[currentSession.messages.length - 1];
    
    if (lastMsg.role === 'model') {
        const history = currentSession.messages.slice(0, -1);
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: history } : s));
        await runChatStream(currentSessionId, history);
    }
  };

  // --- Storage Switch Handler ---
  const handleChangeStorageMode = async (mode: StorageType): Promise<boolean> => {
      if (mode === 'browser') {
          // Switch to browser: Clear current sessions and load from LocalStorage
          const localSessions = loadSessionsFromLocal();
          setSessions(localSessions);
          if (localSessions.length > 0) handleSelectSession(localSessions[0].id, localSessions);
          else createNewSession();
          
          setNeedsPermission(false);
          // Remove local directory name from settings when switching to browser
          setSettings(prev => ({ ...prev, storageType: 'browser', localDirectoryName: undefined }));
          return true;
      } else {
          // Switch to Local: Ask for directory
          try {
              if (!('showDirectoryPicker' in window)) {
                   alert("您的浏览器不支持本地目录访问功能。");
                   return false;
              }

              const handle = await (window as any).showDirectoryPicker();
              if (handle) {
                  dirHandleRef.current = handle;
                  
                  // 1. Load data from directory
                  await saveDirectoryHandle(handle); 
                  const { sessions: fsSessions, settings: fsSettings } = await loadFromDirectory(handle);
                  setSessions(fsSessions);
                  
                  // 2. Prepare new settings object
                  // Merge loaded settings OR current settings with the new directory name
                  const newSettings: AppSettings = {
                      ...(fsSettings || settings),
                      storageType: 'local',
                      localDirectoryName: handle.name
                  };
                  
                  // 3. Update State & Persist
                  setSettings(newSettings);
                  await saveSettingsToDirectory(handle, newSettings);

                  // 4. Set Session
                  if (fsSessions.length > 0) {
                      handleSelectSession(fsSessions[0].id, fsSessions);
                  } else {
                      createNewSession();
                  }
                  
                  return true;
              }
          } catch (e: any) {
              if (e.name === 'AbortError') return false; // User cancelled
              
              if (e.name === 'SecurityError' || e.message?.includes('Cross origin') || e.code === 18) {
                   alert("环境限制：当前运行环境（如 iframe 预览或沙箱）不支持直接访问本地文件系统。请在独立窗口中打开应用，或继续使用“浏览器托管”模式。");
                   return false;
              }

              console.error("Failed to pick directory", e);
              alert("无法访问目录：请检查权限或重试。");
          }
          return false;
      }
  };

  // --- Delete Handler Wrapper ---
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      
      if (settings.storageType === 'local' && dirHandleRef.current) {
          await deleteSessionFromDirectory(dirHandleRef.current, id);
      } else {
          await deleteFileFromDB(id);
      }
      
      const newSessions = sessions.filter(s => s.id !== id);
      setSessions(newSessions);
      
      if(currentSessionId === id) {
           if (newSessions.length > 0) {
               handleSelectSession(newSessions[0].id, newSessions);
           } else {
               createNewSession();
           }
      }
  };

  const handleExplainPage = async (imageData: string) => {
    if (!currentSessionId) return;
    
    const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: "请解释这一页的内容。",
        timestamp: Date.now(),
        attachments: [{ type: 'image', data: imageData }]
    };
    
    addMessageToCurrentSession(userMsg);

    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession) return;
    
    const history = [...currentSession.messages, userMsg];
    await runChatStream(currentSessionId, history);
  };

  const handleQuoteText = (text: string) => {
      setQuotedText(text);
  };

  const handleExportData = () => {
    const exportable = sessions.map(s => {
        const { file, ...rest } = s;
        return rest;
    });
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (file: File) => {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
            const existingIds = new Set(sessions.map(s => s.id));
            const validSessions = data.filter((s: any) => s.id && !existingIds.has(s.id));
            
            if (validSessions.length > 0) {
                setSessions(prev => [...prev, ...validSessions]);
                alert(`成功导入 ${validSessions.length} 条记录`);
            } else {
                alert("没有发现新的记录");
            }
        }
    } catch (e) {
        console.error("Import failed", e);
        alert("导入失败");
    }
  };

  return (
    <div 
        className={`flex h-screen w-full bg-white overflow-hidden font-sans text-zinc-900 ${isResizing ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => handleSelectSession(id)}
        onNewSession={createNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-50 relative">
        
        {/* Permission Banner for FS Mode */}
        {needsPermission && settings.storageType === 'local' && (
            <div className="bg-amber-50 border-b border-amber-100 p-2 px-4 flex items-center justify-between text-xs text-amber-800 absolute top-0 left-0 right-0 z-40">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <span>需要权限以访问本地存储目录</span>
                </div>
                <button 
                    onClick={requestPermission}
                    className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md font-medium transition-colors"
                >
                    授予权限
                </button>
            </div>
        )}

        {/* Split View */}
        <div className={`flex flex-1 overflow-hidden ${needsPermission && settings.storageType === 'local' ? 'pt-10' : ''}`}>
            {/* Left: PDF */}
            <div className="flex-1 flex-col relative min-w-0 flex">
                {!currentFile ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8">
                        <div className="max-w-md w-full text-center space-y-6">
                            <div className="mx-auto w-24 h-24 bg-gradient-to-tr from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center shadow-inner">
                                <Upload size={40} className="text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-zinc-800 mb-2">上传 PDF 文档</h2>
                                <p className="text-zinc-500 text-sm leading-relaxed mb-4">
                                    {settings.storageType === 'local' 
                                        ? "当前模式：本地目录存储。上传的文件将直接保存到您的文件夹中。" 
                                        : "上传文档以开启 AI 智能分析、摘要总结和上下文问答。"}
                                </p>
                                {settings.storageType === 'local' && (
                                     <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                                        <HardDrive size={12} /> 本地存储已启用
                                     </div>
                                )}
                            </div>
                            
                            <label className="block w-full cursor-pointer group">
                                <div className="px-8 py-4 bg-zinc-900 text-white rounded-xl shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2 font-medium">
                                    <Upload size={18} />
                                    <span>选择 PDF 文件</span>
                                </div>
                                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                    </div>
                ) : (
                    <PDFViewer 
                        file={currentFile} 
                        onTextExtract={handleTextExtracted}
                        onFileLoaded={() => {}}
                        onExplainPage={handleExplainPage}
                        onQuoteText={handleQuoteText}
                        onPageDimensions={handlePageDimensions}
                        isResizingLayout={isResizing}
                    />
                )}
            </div>

            {/* Resizer */}
            <div 
                onMouseDown={startResizing}
                className={`w-px hover:w-1.5 group cursor-col-resize z-30 flex items-center justify-center -ml-[1px] ${isResizing ? 'w-1.5 bg-blue-500' : 'bg-zinc-200 hover:bg-blue-400'}`}
            >
                <div className={`h-8 w-1 rounded-full bg-white shadow-sm transition-opacity ${isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
            </div>

            {/* Right: Chat */}
            <div 
                style={{ width: chatWidth }}
                className="bg-white flex flex-col shadow-2xl shadow-zinc-200/50 z-20 shrink-0 border-l border-zinc-100"
            >
                <ChatInterface 
                    messages={currentSessionId ? sessions.find(s => s.id === currentSessionId)?.messages || [] : []}
                    isLoading={isLoading}
                    onSendMessage={handleSendMessage}
                    onEditMessage={handleEditMessage}
                    onRegenerate={handleRegenerate}
                    onStop={() => setIsLoading(false)}
                    isDisabled={!currentFile}
                    pendingAttachment={pendingAttachment}
                    onClearAttachment={() => setPendingAttachment(null)}
                    onSetAttachment={(data) => setPendingAttachment(data)}
                    quotedText={quotedText}
                    onQuoteConsumed={() => setQuotedText(null)}
                />
            </div>
        </div>
      </div>

      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        settings={settings}
        onSave={(newSettings) => {
            setSettings(newSettings);
            persistSettings(newSettings);
        }}
        onExportData={handleExportData}
        onImportData={handleImportData}
        onChangeStorageMode={handleChangeStorageMode}
        directoryName={settings.localDirectoryName}
      />
    </div>
  );
};

export default App;
