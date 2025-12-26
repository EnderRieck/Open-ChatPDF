
# AI PDF 阅读器 (AI PDF Reader)

这是一个基于 Web 的现代化双栏 PDF 阅读器，集成了 Google Gemini (和 OpenAI 兼容接口) 的强大 AI 能力。它允许你在阅读文档的同时，与其进行深度对话、总结摘要、甚至进行视觉层面的页面分析。

![App Screenshot](https://via.placeholder.com/800x450?text=AI+PDF+Reader+Preview)

## ✨ 核心功能

### 📖 阅读体验
*   **双栏设计**：左侧阅读 PDF，右侧实时 AI 对话，宽度可只有拖拽调整。
*   **平滑浏览**：支持鼠标滚轮缩放 (Ctrl+滚轮)、抓手拖拽模式、页面跳转。
*   **文本操作**：支持选取 PDF 文本并在对话框中引用。

### 🤖 AI 智能辅助
*   **智能摘要**：打开文档时自动生成全文摘要。
*   **上下文对话**：AI 知道你正在阅读的内容，你可以针对文档细节提问。
*   **视觉分析 ("解释这一页")**：利用 Gemini 的多模态能力，可以将当前 PDF页面的截图发送给 AI 进行图表、公式或布局分析。
*   **引用回复**：选中 PDF 中的一段话，点击右键“引用选中内容”，AI 将针对该段落进行回答。
*   **富文本渲染**：支持 Markdown、代码高亮、LaTeX 数学公式 ($E=mc^2$) 渲染。

### 💾 数据隐私与存储
*   **浏览器模式**：开箱即用，数据存储在浏览器本地 (IndexedDB)，清除缓存即丢失。
*   **本地目录模式 (核心特性)**：
    *   直接读写你电脑上的文件夹。
    *   对话记录 (`chat.json`)、上传的 PDF 和配置文件 (`settings.json`) 都会保存在你指定的文件夹中。
    *   **真正的数据只有你拥有，且方便备份和迁移。**

---

## ⚙️ 设置指南

点击侧边栏底部的 **"设置"** 图标即可进入配置页面。

### 1. AI 服务配置 (API)

本应用不提供后台服务器，**你需要提供自己的 API Key**。

*   **Google Gemini (推荐)**:
    *   **模型**: 默认为 `gemini-3-flash-preview` (速度快，支持长文本)。
    *   **Base URL**: 默认为 `https://generativelanguage.googleapis.com`。
    *   **特点**: 原生支持多模态（图片识别），免费额度高，不仅能读字还能“看”图。

*   **OpenAI 兼容接口**:
    *   支持 GPT-4, DeepSeek, Claude (通过转发) 等。
    *   **注意**: 由于浏览器的安全策略 (CORS)，你不能直接在网页端填 `api.openai.com`。**必须填写支持跨域访问的代理地址** (Base URL)。

### 2. 数据存储模式

*   **浏览器托管 (Browser Mode)**:
    *   适合临时使用。
    *   不需要文件系统权限。
    
*   **本地目录 (Local Directory)**:
    *   **推荐用于长期项目**。
    *   点击切换后，浏览器会请求选择一个本地文件夹。
    *   **目录结构**:
        ```text
        你的文件夹/
        ├── settings.json       # 保存你的 API Key 和偏好设置
        └── sessions/           # 所有对话记录
            └── {uuid}/         # 单个对话文件夹
                ├── chat.json   # 聊天记录
                └── document.pdf # (可选) 原始文件备份
        ```

---

## 🛠️ 使用技巧

1.  **上传文件**: 点击左侧上传区域，或直接将 PDF 拖入窗口。
2.  **引用文本**:
    *   在 PDF 中用鼠标选中一段文字。
    *   **右键点击** -> 选择 **"引用选中内容"**。
    *   文本会以卡片形式出现在输入框上方。
3.  **解释页面 (视觉模式)**:
    *   在 PDF 任意位置 **右键点击**。
    *   选择 **"解释这一页"**。
    *   当前页面的截图会被发送给 AI，适合解释复杂的图表、扫描件或手写笔记。
4.  **调整布局**: 鼠标移动到 PDF 和聊天框的分界线处，可以拖拽调整宽度。

## 📦 技术栈

*   **Frontend**: React 19, TypeScript, Vite
*   **UI**: Tailwind CSS, Lucide React
*   **PDF Core**: react-pdf (PDF.js)
*   **AI SDK**: @google/genai (官方 SDK)
*   **Markdown**: react-markdown, rehype-katex (Math), highlight.js (Code)
*   **Storage**: File System Access API + IndexedDB

## ⚠️ 注意事项

*   **API Key 安全**: API Key 仅保存在你的浏览器本地或你指定的本地目录中，**不会**上传到任何第三方服务器。
*   **本地目录权限**: 每次重新打开网页，浏览器可能会出于安全要求再次询问是否允许访问该目录，点击允许即可。

---

_Created by AI PDF Reader Team_
