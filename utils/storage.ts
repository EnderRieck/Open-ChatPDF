
import { ChatSession, AppSettings } from '../types';

const DB_NAME = 'ai-pdf-db';
const STORE_NAME = 'files';
const HANDLE_STORE_NAME = 'handles'; // For storing the directory handle

// --- IndexedDB Basics (Existing) ---

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Bump version
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
  });
};

export const saveFileToDB = async (sessionId: string, file: File): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(file, sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to save file to DB:", error);
    throw error;
  }
};

export const getFileFromDB = async (sessionId: string): Promise<File | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get file from DB:", error);
    return undefined;
  }
};

export const deleteFileFromDB = async (sessionId: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to delete file from DB:", error);
  }
};

// --- Browser Storage Helpers ---

export const saveSessionsToLocal = (sessions: ChatSession[]) => {
  try {
    const cleanSessions = sessions.map(s => {
      const { file, ...rest } = s; 
      return rest;
    });
    localStorage.setItem('ai-pdf-sessions', JSON.stringify(cleanSessions));
  } catch (error) {
    console.error("Failed to save sessions to localStorage:", error);
  }
};

export const loadSessionsFromLocal = (): ChatSession[] => {
  try {
    const data = localStorage.getItem('ai-pdf-sessions');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load sessions from localStorage:", error);
    return [];
  }
};

// --- File System Access API (New) ---

// 1. Persist Directory Handle to IDB
export const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const req = store.put(handle, 'root_dir');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const req = store.get('root_dir');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

// 2. Permission Check
export const verifyPermission = async (handle: FileSystemDirectoryHandle, readWrite: boolean): Promise<boolean> => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
      // Cast handle to any to bypass missing type definitions for queryPermission/requestPermission in some environments
      if ((await (handle as any).queryPermission(options)) === 'granted') {
        return true;
      }
      if ((await (handle as any).requestPermission(options)) === 'granted') {
        return true;
      }
      return false;
  } catch (error) {
      console.warn("Permission check failed (likely blocked by browser security/iframe):", error);
      return false;
  }
};

// 3. Sync Logic (Load)
export const loadFromDirectory = async (rootDir: FileSystemDirectoryHandle): Promise<{ sessions: ChatSession[], settings: AppSettings | null }> => {
  const sessions: ChatSession[] = [];
  let settings: AppSettings | null = null;

  try {
    // A. Load Settings
    try {
      const settingsHandle = await rootDir.getFileHandle('settings.json');
      const file = await settingsHandle.getFile();
      const text = await file.text();
      settings = JSON.parse(text);
    } catch (e) {
      // No settings file yet, ignore
    }

    // B. Load Sessions
    const sessionsDirHandle = await rootDir.getDirectoryHandle('sessions', { create: true });
    
    // Iterate over session sub-directories
    // @ts-ignore - entries() iterator support varies by browser types setup
    for await (const [name, handle] of sessionsDirHandle.entries()) {
      if (handle.kind === 'directory') {
        const sessionDir = handle as FileSystemDirectoryHandle;
        try {
          // 1. Load Chat Data
          const chatHandle = await sessionDir.getFileHandle('chat.json');
          const chatFile = await chatHandle.getFile();
          const chatData = JSON.parse(await chatFile.text());

          // 2. Load PDF (if exists)
          let pdfFile: File | undefined = undefined;
          try {
            const pdfHandle = await sessionDir.getFileHandle('document.pdf');
            pdfFile = await pdfHandle.getFile();
          } catch (e) {
            // No PDF
          }

          // Merge
          sessions.push({
            ...chatData,
            id: name, // Use folder name as ID to be safe
            file: pdfFile
          });
        } catch (e) {
          console.warn(`Skipping corrupted session folder: ${name}`, e);
        }
      }
    }
  } catch (err) {
    console.error("Error traversing directory:", err);
    throw err;
  }

  // Sort by lastUpdated desc
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  return { sessions, settings };
};

// 4. Sync Logic (Save Single Session)
export const saveSessionToDirectory = async (rootDir: FileSystemDirectoryHandle, session: ChatSession) => {
  try {
    const sessionsDir = await rootDir.getDirectoryHandle('sessions', { create: true });
    const sessionDir = await sessionsDir.getDirectoryHandle(session.id, { create: true });

    // 1. Save Chat Data (exclude File object)
    const { file, ...metaData } = session;
    const chatHandle = await sessionDir.getFileHandle('chat.json', { create: true });
    const writable = await chatHandle.createWritable();
    await writable.write(JSON.stringify(metaData, null, 2));
    await writable.close();

    // 2. Save PDF if it exists and hasn't been saved? 
    // Optimization: We overwrite it every time here for simplicity, 
    // but in a real app check if changed. Since file API is fast for local, it's okay.
    if (file) {
      const pdfHandle = await sessionDir.getFileHandle('document.pdf', { create: true });
      const pdfWritable = await pdfHandle.createWritable();
      await pdfWritable.write(file);
      await pdfWritable.close();
    }
  } catch (e) {
    console.error(`Failed to save session ${session.id} to FS:`, e);
  }
};

// 5. Delete Session from Directory
export const deleteSessionFromDirectory = async (rootDir: FileSystemDirectoryHandle, sessionId: string) => {
    try {
        const sessionsDir = await rootDir.getDirectoryHandle('sessions', { create: false });
        await sessionsDir.removeEntry(sessionId, { recursive: true });
    } catch (e) {
        console.error("Failed to delete session dir", e);
    }
};

// 6. Save Settings to Directory
export const saveSettingsToDirectory = async (rootDir: FileSystemDirectoryHandle, settings: AppSettings) => {
    try {
        const settingsHandle = await rootDir.getFileHandle('settings.json', { create: true });
        const writable = await settingsHandle.createWritable();
        await writable.write(JSON.stringify(settings, null, 2));
        await writable.close();
    } catch (e) {
        console.error("Failed to save settings to FS", e);
    }
};
