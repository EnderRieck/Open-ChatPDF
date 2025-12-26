
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ZoomIn, ZoomOut, Upload, FileText, MousePointerClick, Hand, MousePointer2, Maximize, ChevronLeft, ChevronRight } from 'lucide-react';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: File | null;
  onTextExtract: (text: string) => void;
  onFileLoaded: (numPages: number) => void;
  onExplainPage: (imageData: string) => void;
  onQuoteText: (text: string) => void;
  onPageDimensions?: (width: number, height: number) => void;
  isResizingLayout?: boolean;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ 
  file, 
  onTextExtract, 
  onFileLoaded, 
  onExplainPage,
  onQuoteText,
  onPageDimensions,
  isResizingLayout = false
}) => {
  // --- State ---
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  
  // Tools & Modes
  const [toolMode, setToolMode] = useState<'select' | 'drag'>('select');
  const [fitMode, setFitMode] = useState<'manual' | 'auto'>('auto');
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Panning State
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });

  // Input State
  const [inputPage, setInputPage] = useState<string>("1");
  const [inputZoom, setInputZoom] = useState<string>("100");

  const containerRef = useRef<HTMLDivElement>(null);
  const lastWheelTime = useRef<number>(0);

  // --- Synchronization Effects ---

  useEffect(() => {
    setInputPage(pageNumber.toString());
  }, [pageNumber]);

  useEffect(() => {
    setInputZoom(Math.round(scale * 100).toString());
  }, [scale]);

  // --- Auto-Fit Logic ---

  const fitToContainer = useCallback((dimensions = pageDimensions) => {
    if (!containerRef.current || !dimensions) return;
    
    // 1. Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    // 2. Define Padding and Buffer
    const scrollbarBuffer = 20; 
    const paddingX = 64; // Horizontal padding
    const paddingY = 40; // Vertical padding

    // 3. Calculate Available Space
    const availableWidth = Math.max(containerWidth - paddingX - scrollbarBuffer, 1);
    const availableHeight = Math.max(containerHeight - paddingY, 1);

    const scaleX = availableWidth / dimensions.width;
    const scaleY = availableHeight / dimensions.height;
    
    // 4. Determine New Scale
    let newScale = Math.min(scaleX, scaleY, 1.5);
    newScale = Math.max(0.1, newScale); 
    
    newScale = parseFloat(newScale.toFixed(2));

    // 5. Update Scale
    // If we are dragging layout, we want instant updates (threshold 0)
    // Otherwise, we use a small threshold to avoid jitter from minor rounding
    const threshold = isResizingLayout ? 0 : 0.01;

    setScale(prevScale => {
        if (Math.abs(prevScale - newScale) <= threshold) {
            return prevScale;
        }
        return newScale;
    });

  }, [pageDimensions, isResizingLayout]);

  // Initial fit
  useEffect(() => {
    if (fitMode === 'auto' && pageDimensions) {
        const timer = setTimeout(() => fitToContainer(), 50);
        return () => clearTimeout(timer);
    }
  }, [pageDimensions, fitMode, fitToContainer]);

  // Ensure final fit after resizing stops to correct any potential overflow glitches
  useEffect(() => {
      if (!isResizingLayout && fitMode === 'auto') {
          fitToContainer();
      }
  }, [isResizingLayout, fitMode, fitToContainer]);

  // --- Resizing Strategy: RAF + Hidden Scrollbar ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;

    const observer = new ResizeObserver(() => {
      if (fitMode === 'auto') {
        // Use requestAnimationFrame for smoother visual updates linked to refresh rate
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            fitToContainer();
        });
      }
    });

    observer.observe(container);
    return () => {
        observer.disconnect();
        cancelAnimationFrame(rafId);
    };
  }, [fitMode, fitToContainer]);


  // --- Event Handlers ---

  // Keyboard Navigation
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (numPages === 0) return;
      
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        setPageNumber(prev => Math.max(prev - 1, 1));
      } else if (e.key === 'ArrowRight') {
        setPageNumber(prev => Math.min(prev + 1, numPages));
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [numPages]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setFitMode('manual');
      const zoomStep = 0.05; 
      setScale(prevScale => {
          const delta = e.deltaY < 0 ? zoomStep : -zoomStep;
          const newScale = Math.min(Math.max(prevScale + delta, 0.1), 5.0);
          return parseFloat(newScale.toFixed(2));
      });
    } else if (e.shiftKey) {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime.current > 100) {
        if (e.deltaY > 0) {
           setPageNumber(p => Math.min(p + 1, numPages));
        } else {
           setPageNumber(p => Math.max(p - 1, 1));
        }
        lastWheelTime.current = now;
      }
    }
  }, [numPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --- Drag Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((toolMode !== 'drag' && e.button !== 1) || contextMenu) return;
    if (e.button === 0 && toolMode !== 'drag') return; 

    e.preventDefault();
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    if (containerRef.current) {
        setScrollPos({ 
            left: containerRef.current.scrollLeft, 
            top: containerRef.current.scrollTop 
        });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    containerRef.current.scrollLeft = scrollPos.left - dx;
    containerRef.current.scrollTop = scrollPos.top - dy;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- Inputs ---
  const handlePageInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        const val = parseInt(inputPage);
        if (!isNaN(val) && val >= 1 && val <= numPages) {
            setPageNumber(val);
            (e.target as HTMLInputElement).blur();
        } else {
            setInputPage(pageNumber.toString());
        }
    }
  };

  const handleZoomInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        setFitMode('manual');
        let val = parseInt(inputZoom.replace('%', ''));
        if (!isNaN(val)) {
            val = Math.max(10, Math.min(500, val));
            setScale(val / 100);
            (e.target as HTMLInputElement).blur();
        } else {
            setInputZoom(Math.round(scale * 100).toString());
        }
    }
  };

  // --- PDF Events ---
  const onDocumentLoadSuccess = async (pdf: any) => {
    setNumPages(pdf.numPages);
    onFileLoaded(pdf.numPages);
    setFitMode('auto');

    // PRE-FETCH Dimensions
    try {
        const page = await pdf.getPage(1); 
        const viewport = page.getViewport({ scale: 1 });
        const dims = { width: viewport.width, height: viewport.height };
        setPageDimensions(dims);
    } catch (e) {
        console.error("Failed to pre-fetch dimensions", e);
    }
    
    // Extract text
    let fullText = "";
    const maxPages = Math.min(pdf.numPages, 5);
    try {
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `Page ${i}: ${pageText}\n\n`;
        }
        onTextExtract(fullText);
    } catch (e) {
        console.error("Text extraction failed", e);
    }
  };

  const onPageLoadSuccess = (page: any) => {
      // Robustly get UN-SCALED dimensions
      const viewport = page.getViewport({ scale: 1 });
      const width = viewport.width;
      const height = viewport.height;
      
      setPageDimensions(prev => {
          if (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
              return prev;
          }
          return { width, height };
      });

      if (onPageDimensions) {
          onPageDimensions(width, height);
      }
  };

  // --- Context Menu ---
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleExplainPage = () => {
    const pageElement = document.querySelector(`.react-pdf__Page[data-page-number="${pageNumber}"] canvas`) as HTMLCanvasElement;
    if (pageElement) {
        onExplainPage(pageElement.toDataURL('image/png'));
    }
    setContextMenu(null);
  };
  
  const handleQuoteSelection = () => {
     const selection = window.getSelection();
     if (selection) {
         onQuoteText(selection.toString());
     }
     setContextMenu(null);
  };

  useEffect(() => {
      const handleClick = () => setContextMenu(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
  }, []);

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 border-r border-zinc-200 text-zinc-400">
        <div className="p-8 rounded-2xl bg-white border border-dashed border-zinc-200 shadow-sm flex flex-col items-center">
             <Upload size={48} className="mb-4 text-zinc-300" />
            <p className="text-lg font-semibold text-zinc-700">暂无文档</p>
            <p className="text-sm text-zinc-500 mt-2">请从左侧或拖拽上传 PDF</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 relative min-w-0">
      {/* Modern Floating-style Toolbar Container */}
      <div className="bg-white/90 backdrop-blur-md border-b border-zinc-200 px-4 py-2 shadow-sm z-20 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4">
            
            {/* File Info */}
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 min-w-0">
                <div className="p-1.5 bg-red-50 text-red-500 rounded-lg shrink-0">
                    <FileText size={18} />
                </div>
                <span className="truncate max-w-[150px] md:max-w-[200px]" title={file.name}>{file.name}</span>
            </div>

            {/* Controls Group */}
            <div className="flex flex-wrap items-center gap-2">
                
                {/* Page Nav */}
                <div className="flex items-center bg-zinc-50 rounded-lg border border-zinc-200 p-0.5 shadow-sm">
                    <button onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))} disabled={pageNumber <= 1} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 text-zinc-600 transition-all">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center px-2 text-sm font-medium text-zinc-600 font-mono">
                        <input 
                            type="text" 
                            value={inputPage}
                            onChange={(e) => setInputPage(e.target.value)}
                            onKeyDown={handlePageInputSubmit}
                            onBlur={() => setInputPage(pageNumber.toString())}
                            className="w-8 text-center bg-transparent outline-none"
                        />
                        <span className="opacity-40">/</span>
                        <span className="ml-1">{numPages}</span>
                    </div>
                    <button onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))} disabled={pageNumber >= numPages} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 text-zinc-600 transition-all">
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Tools */}
                <div className="flex bg-zinc-50 rounded-lg p-0.5 border border-zinc-200 shadow-sm">
                    <button 
                        onClick={() => setToolMode('select')}
                        className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2.5 ${toolMode === 'select' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-zinc-500 hover:text-zinc-700'}`}
                        title="选择文字"
                    >
                        <MousePointer2 size={16} />
                    </button>
                    <button 
                        onClick={() => setToolMode('drag')}
                        className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2.5 ${toolMode === 'drag' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-zinc-500 hover:text-zinc-700'}`}
                        title="抓手工具"
                    >
                        <Hand size={16} />
                    </button>
                </div>

                {/* Zoom */}
                <div className="flex items-center bg-zinc-50 rounded-lg border border-zinc-200 p-0.5 shadow-sm">
                     <button 
                        onClick={() => {
                            setFitMode('auto');
                            fitToContainer();
                        }}
                        className={`p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all ${fitMode === 'auto' ? 'text-blue-600 bg-blue-50/50' : 'text-zinc-500'}`}
                        title="自动适应"
                    >
                        <Maximize size={16} />
                    </button>
                    <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                    <button onClick={() => { setScale(s => Math.max(0.1, parseFloat((s - 0.1).toFixed(2)))); setFitMode('manual'); }} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-zinc-600">
                        <ZoomOut size={16} />
                    </button>
                    <input 
                        type="text"
                        value={inputZoom}
                        onChange={(e) => setInputZoom(e.target.value)}
                        onKeyDown={handleZoomInputSubmit}
                        onBlur={() => setInputZoom(Math.round(scale * 100).toString())}
                        className="w-10 text-center text-xs bg-transparent outline-none font-medium text-zinc-600"
                    />
                    <button onClick={() => { setScale(s => Math.min(5, parseFloat((s + 0.1).toFixed(2)))); setFitMode('manual'); }} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-zinc-600">
                        <ZoomIn size={16} />
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* PDF Container */}
      <div 
        className={`flex-1 relative flex ${
            isDragging ? 'cursor-grabbing' : toolMode === 'drag' ? 'cursor-grab' : 'cursor-default'
        } ${isResizingLayout ? 'overflow-hidden' : 'overflow-auto'}`}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={containerRef}
      >
        <div 
            className={`m-auto p-8 origin-top ${toolMode === 'drag' ? 'pointer-events-none' : ''}`}
        >
          <div className="rounded-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-200/50 bg-white">
             <Document
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => console.error("PDF Load Error:", error)}
                loading={
                <div className="flex items-center gap-2 text-zinc-500 p-10 bg-white">
                    <Loader2 className="animate-spin" /> 加载 PDF...
                </div>
                }
                className="bg-white"
                error={<div className="text-red-500 p-10 bg-white">无法加载 PDF。</div>}
            >
                <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                onLoadSuccess={onPageLoadSuccess}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="bg-white"
                loading={<div className="w-full h-full min-h-[200px] bg-white animate-pulse flex items-center justify-center text-zinc-300"></div>}
                />
            </Document>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
            className="fixed bg-white/95 backdrop-blur-xl shadow-2xl rounded-xl border border-zinc-200 py-1 z-50 min-w-[200px] animate-in fade-in zoom-in-95 duration-100 overflow-hidden ring-1 ring-black/5"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-col">
                <button 
                    onClick={handleExplainPage}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-600 text-sm text-zinc-700 flex items-center gap-3 transition-colors font-medium border-b border-zinc-100 last:border-none"
                >
                    <MousePointerClick size={16} /> 
                    <span>解释这一页</span>
                </button>
                {window.getSelection()?.toString() && (
                    <button 
                    onClick={handleQuoteSelection}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-600 text-sm text-zinc-700 flex items-center gap-3 transition-colors font-medium"
                >
                    <FileText size={16} /> 
                    <span>引用选中内容</span>
                </button>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;
