
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AppSettings, Message } from "../types";

export class LLMService {
  private client: GoogleGenAI | null = null;
  private currentSettings: AppSettings | null = null;

  initialize(settings: AppSettings) {
    const envApiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
    const apiKey = settings.apiKey || envApiKey;
    
    this.currentSettings = settings;

    // Only init Gemini client if provider is gemini and we have a key
    if (settings.provider === 'gemini' && apiKey) {
        this.client = new GoogleGenAI({ 
          apiKey, 
        });
    } else {
        this.client = null;
    }
  }

  async generateSummary(text: string): Promise<string> {
    if (!this.currentSettings) throw new Error("服务未初始化");
    
    const prompt = `请为以下文档文本提供一个简明的中文摘要，用于聊天交互的背景上下文。突出关键主题和结构。\n\n文本:\n${text.substring(0, 30000)}...`;

    if (this.currentSettings.provider === 'gemini') {
        return this.generateSummaryGemini(prompt);
    } else {
        return this.generateSummaryOpenAI(prompt);
    }
  }

  private async generateSummaryGemini(prompt: string): Promise<string> {
    if (!this.client || !this.currentSettings) return "Gemini 客户端未就绪";
    try {
      const response = await this.client.models.generateContent({
        model: this.currentSettings.model,
        contents: prompt, 
      });
      return response.text || "无法生成摘要。";
    } catch (error) {
      console.error("Gemini 摘要生成失败", error);
      return "摘要不可用。";
    }
  }

  private async generateSummaryOpenAI(prompt: string): Promise<string> {
      try {
          const content = await this.simpleOpenAIChat(prompt);
          return content || "无法生成摘要。";
      } catch (error: any) {
          console.error("OpenAI 摘要生成失败", error);
          if (error.message === 'Failed to fetch') {
              return "摘要生成失败：连接错误 (可能是 CORS 跨域限制，浏览器无法直接访问此 API)";
          }
          return `摘要生成失败: ${error.message}`;
      }
  }

  async *streamChat(messages: Message[], contextSummary?: string): AsyncGenerator<string, void, unknown> {
    if (!this.currentSettings) throw new Error("服务未初始化");

    const systemInstruction = "你是一个嵌入在PDF阅读器中的得力AI助手。请始终用中文回答用户的问题。";
    let fullSystemPrompt = systemInstruction;
    if (contextSummary) {
      fullSystemPrompt += `\n\n以下是当前打开的PDF文档摘要：\n${contextSummary}\n\n请在相关时基于此上下文回答问题。`;
    }

    if (this.currentSettings.provider === 'gemini') {
        yield* this.streamChatGemini(messages, fullSystemPrompt);
    } else {
        yield* this.streamChatOpenAI(messages, fullSystemPrompt);
    }
  }

  // --- Gemini Implementation ---

  private async *streamChatGemini(messages: Message[], systemInstruction: string): AsyncGenerator<string, void, unknown> {
    if (!this.client || !this.currentSettings) {
        yield "请检查 API 密钥设置。";
        return;
    }

    const chatHistory = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1) 
      .map(m => {
        const parts: any[] = [];
        if (m.attachments && m.attachments.length > 0) {
            m.attachments.forEach(att => {
                const match = att.data.match(/^data:(.*?);base64,/);
                const mimeType = match ? match[1] : 'image/jpeg';
                const base64 = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
                parts.push({ inlineData: { mimeType, data: base64 } });
            });
        }
        if (m.content) parts.push({ text: m.content });
        if (parts.length === 0) parts.push({ text: " " });
        return { role: m.role, parts };
      });

    const lastMessage = messages[messages.length - 1];
    const newParts: any[] = [];
    if (lastMessage.attachments && lastMessage.attachments.length > 0) {
      lastMessage.attachments.forEach(att => {
        const match = att.data.match(/^data:(.*?);base64,/);
        const mimeType = match ? match[1] : 'image/png';
        const base64 = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
        newParts.push({ inlineData: { mimeType, data: base64 } });
      });
    }
    if (lastMessage.content) newParts.push({ text: lastMessage.content });
    else if (newParts.length === 0) newParts.push({ text: " " });

    const chat = this.client.chats.create({
      model: this.currentSettings.model,
      config: {
        systemInstruction: systemInstruction,
        temperature: this.currentSettings.temperature,
      },
      history: chatHistory as any,
    });

    try {
        const resultStream = await chat.sendMessageStream({
            message: newParts
        });

        for await (const chunk of resultStream) {
            const c = chunk as GenerateContentResponse;
            if (c.text) yield c.text;
        }
    } catch (e: any) {
        console.error("Gemini Stream error", e);
        yield `\n\n**Gemini Error:** ${e.message || 'Unknown error'}`;
    }
  }

  // --- OpenAI Implementation ---

  private getOpenAIUrl(baseUrl: string): string {
      let cleanUrl = baseUrl.replace(/\/+$/, '');
      if (cleanUrl.endsWith('/chat/completions')) {
          return cleanUrl;
      }
      return `${cleanUrl}/chat/completions`;
  }

  private async *streamChatOpenAI(messages: Message[], systemInstruction: string): AsyncGenerator<string, void, unknown> {
      if (!this.currentSettings) return;

      const apiMessages = [
          { role: 'system', content: systemInstruction },
          ...messages.map(m => {
              // Handle text content
              let content: any = m.content;
              
              // Handle image attachments (multimodal)
              if (m.attachments && m.attachments.length > 0) {
                  content = [{ type: "text", text: m.content || "" }];
                  m.attachments.forEach(att => {
                      content.push({
                          type: "image_url",
                          image_url: {
                              url: att.data // data:image/...;base64,...
                          }
                      });
                  });
              }
              return { role: m.role === 'model' ? 'assistant' : 'user', content };
          })
      ];

      const payload = {
          model: this.currentSettings.model,
          messages: apiMessages,
          temperature: this.currentSettings.temperature,
          stream: true
      };

      const url = this.getOpenAIUrl(this.currentSettings.baseUrl);
      
      try {
          const headers: Record<string, string> = {
              'Content-Type': 'application/json',
          };
          if (this.currentSettings.apiKey) {
              headers['Authorization'] = `Bearer ${this.currentSettings.apiKey}`;
          }

          const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
          });

          if (!response.ok) {
              const errText = await response.text();
              throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
          }

          if (!response.body) throw new Error("No response body");

          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

              for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === 'data: [DONE]') continue;
                  if (trimmed.startsWith('data: ')) {
                      try {
                          const json = JSON.parse(trimmed.slice(6));
                          const content = json.choices?.[0]?.delta?.content;
                          if (content) {
                              yield content;
                          }
                      } catch (e) {
                          console.warn("Failed to parse SSE JSON", trimmed);
                      }
                  }
              }
          }
      } catch (e: any) {
          console.error("OpenAI Stream error", e);
          let errorMsg = e.message || 'Connection failed';
          if (errorMsg === 'Failed to fetch') {
              errorMsg += ' (可能是 CORS 跨域限制。浏览器无法直接连接官方 OpenAI API，请使用支持 CORS 的代理或兼容服务)';
          }
          yield `\n\n**OpenAI Error:** ${errorMsg}`;
      }
  }

  private async simpleOpenAIChat(prompt: string): Promise<string> {
      if (!this.currentSettings) return "";
      
      const url = this.getOpenAIUrl(this.currentSettings.baseUrl);
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.currentSettings.apiKey) headers['Authorization'] = `Bearer ${this.currentSettings.apiKey}`;

      const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
              model: this.currentSettings.model,
              messages: [{ role: 'user', content: prompt }],
              temperature: this.currentSettings.temperature
          })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
  }
}

export const geminiService = new LLMService();
