import { AppSettings } from "../types";

export class ImageGenService {
  private settings: AppSettings | null = null;

  initialize(settings: AppSettings) {
    this.settings = settings;
  }

  isEnabled(): boolean {
    return !!(this.settings?.imageGenEnabled && this.settings?.imageGenBaseUrl && this.settings?.imageGenModel);
  }

  async generateImage(prompt: string): Promise<string | null> {
    if (!this.settings || !this.isEnabled()) {
      console.warn("Image generation not configured");
      return null;
    }

    const { imageGenBaseUrl, imageGenModel, imageGenApiKey, apiKey } = this.settings;
    
    // Use imageGenApiKey if provided, otherwise fallback to main apiKey
    const effectiveApiKey = imageGenApiKey || apiKey;
    
    // Clean up URL
    let url = imageGenBaseUrl.replace(/\/+$/, '');
    if (!url.endsWith('/chat/completions')) {
      url = `${url}/chat/completions`;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (effectiveApiKey) {
        headers['Authorization'] = `Bearer ${effectiveApiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: imageGenModel,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Image generation failed (${response.status}):`, errText);
        return null;
      }

      const data = await response.json();
      
      // Handle chat completion response - extract image URL from content
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        // Check if content is a URL
        if (content.startsWith('http')) {
          const imgResponse = await fetch(content);
          const blob = await imgResponse.blob();
          return await this.blobToBase64(blob);
        }
        // Check if content contains markdown image
        const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
        if (mdMatch) {
          const imgResponse = await fetch(mdMatch[1]);
          const blob = await imgResponse.blob();
          return await this.blobToBase64(blob);
        }
        // Check if content is base64
        if (content.startsWith('data:image')) {
          return content;
        }
      }
      
      // Fallback: check for standard image generation response format
      if (data.data?.[0]?.b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      } else if (data.data?.[0]?.url) {
        const imgResponse = await fetch(data.data[0].url);
        const blob = await imgResponse.blob();
        return await this.blobToBase64(blob);
      }
      
      console.warn("Could not extract image from response:", data);
      return null;
    } catch (error) {
      console.error("Image generation error:", error);
      return null;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const imageGenService = new ImageGenService();
