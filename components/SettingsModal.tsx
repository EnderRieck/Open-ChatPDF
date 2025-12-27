
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Download, Upload, AlertCircle, FolderOpen, HardDrive, Database, FolderInput, Server, Cpu, Image, ToggleLeft, ToggleRight } from 'lucide-react';
import { AppSettings, StorageType, ApiProvider } from '../types';
import { AVAILABLE_MODELS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onChangeStorageMode: (mode: StorageType) => Promise<boolean>; 
  directoryName?: string;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSave,
  onExportData,
  onImportData,
  onChangeStorageMode,
  directoryName
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isChangingMode, setIsChangingMode] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        onImportData(file);
    }
    e.target.value = '';
  };

  const handleModeSwitch = async (newMode: StorageType) => {
    if (newMode === localSettings.storageType) return;
    setIsChangingMode(true);
    const success = await onChangeStorageMode(newMode);
    if (success) {
        setLocalSettings({ ...localSettings, storageType: newMode });
    }
    setIsChangingMode(false);
  };

  const handleChangeFolder = async () => {
    setIsChangingMode(true);
    const success = await onChangeStorageMode('local');
    setIsChangingMode(false);
  };

  const handleProviderChange = (newProvider: ApiProvider) => {
      let newBaseUrl = localSettings.baseUrl;
      if (newProvider === 'gemini') {
          if (localSettings.baseUrl.includes('api.openai.com') || localSettings.baseUrl === '') {
              newBaseUrl = 'https://generativelanguage.googleapis.com';
          }
      } else {
          if (localSettings.baseUrl.includes('googleapis.com') || localSettings.baseUrl === '') {
              newBaseUrl = 'https://api.openai.com/v1';
          }
      }
      setLocalSettings({ ...localSettings, provider: newProvider, baseUrl: newBaseUrl });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-zinc-800">设置</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-full transition">
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* Storage Mode Selection */}
          <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">数据存储模式</h3>
              
              <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleModeSwitch('browser')}
                    disabled={isChangingMode}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        localSettings.storageType === 'browser' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' 
                        : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                      <Database size={24} className={localSettings.storageType === 'browser' ? 'text-blue-600' : 'text-zinc-400'} />
                      <div className="text-center">
                          <div className="text-sm font-semibold">浏览器托管</div>
                          <div className="text-[10px] opacity-70 mt-1">无需配置，自动同步</div>
                      </div>
                  </button>

                  <button 
                    onClick={() => handleModeSwitch('local')}
                    disabled={isChangingMode}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        localSettings.storageType === 'local' 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' 
                        : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                      <HardDrive size={24} className={localSettings.storageType === 'local' ? 'text-emerald-600' : 'text-zinc-400'} />
                      <div className="text-center">
                          <div className="text-sm font-semibold">本地目录</div>
                          <div className="text-[10px] opacity-70 mt-1">直接读写本地文件</div>
                      </div>
                  </button>
              </div>

              {localSettings.storageType === 'local' && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex flex-col gap-3 text-xs text-emerald-800">
                     <div className="flex gap-3">
                        <FolderOpen className="shrink-0 text-emerald-600 mt-0.5" size={16} />
                        <div className="leading-relaxed flex-1">
                            <p>您的所有对话和 PDF 都将保存到当前选定的本地文件夹中。</p>
                            {directoryName && (
                                <div className="mt-2 text-xs font-mono bg-emerald-100/50 text-emerald-800 px-2 py-1 rounded border border-emerald-200/50 break-all flex items-center gap-1.5">
                                    <span className="opacity-50 select-none">📂</span>
                                    <span className="font-semibold">{directoryName}</span>
                                </div>
                            )}
                        </div>
                     </div>
                     <button 
                        onClick={handleChangeFolder}
                        disabled={isChangingMode}
                        className="self-start ml-7 px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-700 rounded-md font-medium transition-colors shadow-sm flex items-center gap-2"
                     >
                        <FolderInput size={14} />
                        修改存储目录
                     </button>
                  </div>
              )}
          </div>

          <hr className="border-zinc-100" />

          {/* API Settings */}
          <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">AI 服务配置</h3>
              
              {/* Provider Toggle */}
              <div className="flex p-1 bg-zinc-100 rounded-lg">
                  <button
                    onClick={() => handleProviderChange('gemini')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                        localSettings.provider === 'gemini' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                     <Cpu size={14} /> Google Gemini
                  </button>
                  <button
                    onClick={() => handleProviderChange('openai')}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                        localSettings.provider === 'openai' 
                        ? 'bg-white text-green-600 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                     <Server size={14} /> OpenAI 兼容
                  </button>
              </div>
              
              {localSettings.provider === 'openai' && (
                  <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-2">
                     <AlertCircle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                     <div className="text-xs text-orange-800 leading-relaxed">
                        注意：Web 端直接调用 OpenAI 官方 API 会因 CORS 跨域被浏览器拦截。请务必使用<b>支持 CORS 的代理地址</b>或兼容服务（如 DeepSeek, LocalAI 等）。
                     </div>
                  </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">API 密钥 (API Key)</label>
                <input
                  type="password"
                  value={localSettings.apiKey}
                  onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Base URL 
                    <span className="text-zinc-400 font-normal ml-2 text-xs">
                        (默认: {localSettings.provider === 'gemini' ? 'generativelanguage.googleapis.com' : 'api.openai.com/v1'})
                    </span>
                </label>
                <input
                  type="text"
                  value={localSettings.baseUrl}
                  onChange={(e) => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">模型名称 (Model)</label>
                <input
                  list="model-options"
                  type="text"
                  value={localSettings.model}
                  onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
                  placeholder={localSettings.provider === 'gemini' ? "gemini-..." : "gpt-4..."}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white font-mono"
                />
                <datalist id="model-options">
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="text-[10px] text-zinc-400 mt-1.5">
                    {localSettings.provider === 'openai' 
                     ? "支持 GPT-4, DeepSeek, Claude (via Proxy), Ollama 等任何兼容接口的模型。" 
                     : "推荐使用 Gemini 2.5/3.0 系列模型。"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  温度 (Temperature): {localSettings.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={localSettings.temperature}
                  onChange={(e) => setLocalSettings({ ...localSettings, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>
          </div>

          <hr className="border-zinc-100" />

          {/* Image Generation Settings */}
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Image size={14} /> 图像生成工具
                </h3>
                <button
                  onClick={() => setLocalSettings({ ...localSettings, imageGenEnabled: !localSettings.imageGenEnabled })}
                  className={`p-1 rounded-full transition-colors ${localSettings.imageGenEnabled ? 'text-emerald-600' : 'text-zinc-400'}`}
                >
                  {localSettings.imageGenEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
              
              {localSettings.imageGenEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 leading-relaxed">
                    启用后，AI 可以在需要时调用图像生成工具来创建图片。支持 OpenAI 兼容的图像生成 API（如 DALL-E、Stable Diffusion 等）。
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={localSettings.imageGenBaseUrl}
                      onChange={(e) => setLocalSettings({ ...localSettings, imageGenBaseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">模型名称</label>
                    <input
                      type="text"
                      value={localSettings.imageGenModel}
                      onChange={(e) => setLocalSettings({ ...localSettings, imageGenModel: e.target.value })}
                      placeholder="dall-e-3"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">API 密钥 (可选，留空则使用主 API Key)</label>
                    <input
                      type="password"
                      value={localSettings.imageGenApiKey}
                      onChange={(e) => setLocalSettings({ ...localSettings, imageGenApiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                    />
                  </div>
                </div>
              )}
          </div>

          <hr className="border-zinc-100" />

          {/* Legacy Backup */}
          {localSettings.storageType === 'browser' && (
            <div className="space-y-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">数据迁移</h3>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={onExportData}
                        className="flex flex-col items-center justify-center gap-2 p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all text-zinc-700"
                    >
                        <Download size={18} className="text-blue-600" />
                        <span className="text-sm font-medium">导出记录</span>
                    </button>
                    <button 
                        onClick={handleImportClick}
                        className="flex flex-col items-center justify-center gap-2 p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all text-zinc-700 relative"
                    >
                        <Upload size={18} className="text-green-600" />
                        <span className="text-sm font-medium">导入备份</span>
                        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
                    </button>
                </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-zinc-50 flex justify-end shrink-0">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition text-sm font-medium"
          >
            <Save size={16} />
            保存更改
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
