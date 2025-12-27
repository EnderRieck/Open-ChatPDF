
import { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  apiKey: '', // User must provide this via UI or it defaults to process.env in service
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-3-flash-preview',
  temperature: 0.7,
  storageType: 'browser',
  // Image Generation Defaults
  imageGenEnabled: false,
  imageGenBaseUrl: '',
  imageGenModel: '',
  imageGenApiKey: '',
};

export const AVAILABLE_MODELS = [
  // Gemini Models
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash',
  
  // Common OpenAI Compatible Models (Reference)
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
  'claude-3-5-sonnet-20240620',
];
