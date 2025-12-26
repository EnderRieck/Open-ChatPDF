
export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  attachments?: {
    type: 'image';
    data: string; // base64
  }[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  pdfName?: string;
  file?: File;      // Store the file object associated with this session
  summary?: string; // Store the generated summary context
  lastUpdated: number;
}

export type StorageType = 'browser' | 'local';
export type ApiProvider = 'gemini' | 'openai';

export interface AppSettings {
  provider: ApiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  storageType: StorageType;
  localDirectoryName?: string; // Persisted folder name
}

export interface PdfDocumentInfo {
  file: File;
  numPages: number;
  textSummary?: string;
}
