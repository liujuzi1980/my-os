import type { ImageRecord, ImageGenerationConfig } from '@/types';
import { saveImageRecord, getImageRecordsByCharacter } from '@/db';

// ==================== 接口定义 ====================

export interface GenerateImageOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  model?: string;
  characterId: string;
  messageId: string;
  /** 参考图 base64（用于支持参考图上传的模型） */
  referenceImage?: string;
}

export interface GenerateImageResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  seed?: number;
}

export interface ImageServiceConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

// ==================== 错误类型 ====================

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: 'network' | 'auth' | 'content_policy' | 'rate_limit' | 'unknown' = 'unknown',
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

// ==================== ImageService：生图服务核心 ====================

export class ImageService {
  private config: ImageServiceConfig;

  constructor(config: ImageServiceConfig) {
    this.config = config;
  }

  /**
   * 从 SystemSettings 的 imageGeneration 创建 ImageService 实例
   */
  static fromConfig(config?: ImageGenerationConfig): ImageService | null {
    if (!config || !config.enabled || !config.apiBaseUrl || !config.apiKey) {
      return null;
    }
    return new ImageService({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  // ================================================================
  // 一、生图 API 调用
  // ================================================================

  /**
   * 生成图片
   * 
   * 支持多种生图 API 格式：
   * - OpenAI 格式（DALL-E、gpt-image-2、部分代理）
   * - Gemini 格式（gemini-*-image）
   * - 硅基流动 / 通义万相（通常兼容 OpenAI 格式）
   */
  async generateImage(options: GenerateImageOptions): Promise<ImageRecord> {
    const { prompt, negativePrompt, width, height, characterId, messageId } = options;
    const model = options.model || this.config.model;

    if (!model) {
      throw new ImageGenerationError('未配置生图模型', 'unknown');
    }

    // 2. 检测模型家族并自动选择 API 格式
    const modelFamily = this.detectModelFamily(model);
    console.log('[ImageService] 模型:', model, '家族:', modelFamily.family, '支持参考图:', modelFamily.supportsReferenceImage);

    let result: GenerateImageResult;
    switch (modelFamily.family) {
      case 'wanxiang':
        // 通义万相：支持参考图上传
        result = await this.callWanxiangFormat(prompt, model, options.referenceImage, width, height);
        break;
      case 'gemini':
        // Gemini：使用原生格式
        result = await this.callGeminiFormat(prompt, model, width, height);
        break;
      case 'gpt-image':
      case 'siliconflow':
      case 'other':
      default:
        // GPT Image / 硅基流动 / 其他：使用 OpenAI 格式（不支持参考图）
        result = await this.callOpenAIFormat(prompt, model, width, height);
        break;
    }

    // 3. 生成缩略图
    const thumbnail = await this.createThumbnail(result.blob, { width: 400 });

    // 4. 构建 ImageRecord
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      characterId,
      messageId,
      url: await this.blobToBase64(result.blob),
      storageType: 'base64',
      prompt,
      negativePrompt,
      model,
      seed: result.seed,
      width: result.width,
      height: result.height,
      size: result.blob.size,
      mimeType: result.mimeType,
      thumbnailUrl: await this.blobToBase64(thumbnail),
      generatedAt: Date.now(),
    };

    // 5. 保存到 IndexedDB
    await saveImageRecord(record);

    return record;
  }

  /**
   * 检测 API 格式类型
   */
  private detectApiFormat(model: string): 'openai' | 'gemini' {
    const lower = model.toLowerCase();
    if (lower.includes('gemini')) {
      return 'gemini';
    }
    return 'openai';
  }

  /**
   * 检测模型家族（阶段 4 新增）
   * 
   * 根据模型名自动判断：
   * - 通义万相（wan）：支持参考图上传
   * - GPT Image（gpt-image）：不支持参考图
   * - Gemini（gemini）：取决于代理是否支持 inlineData
   * - 硅基流动（其他）：不支持参考图
   */
  private detectModelFamily(model: string): {
    family: 'wanxiang' | 'gpt-image' | 'gemini' | 'siliconflow' | 'other';
    supportsReferenceImage: boolean;
  } {
    const lower = model.toLowerCase();

    if (lower.includes('wan')) {
      // 通义万相：wan2.6-image, wan2.7-image 等
      return { family: 'wanxiang', supportsReferenceImage: true };
    }

    if (lower.includes('gpt-image')) {
      // GPT Image 系列：gpt-image-2, gpt-image-2-2026-04-21 等
      return { family: 'gpt-image', supportsReferenceImage: false };
    }

    if (lower.includes('gemini')) {
      // Gemini：取决于代理是否支持 inlineData
      return { family: 'gemini', supportsReferenceImage: false };
    }

    if (lower.includes('silicon') || lower.includes('flux') || lower.includes('sd')) {
      // 硅基流动 / FLUX / Stable Diffusion
      return { family: 'siliconflow', supportsReferenceImage: false };
    }

    return { family: 'other', supportsReferenceImage: false };
  }

  /**
   * 检测模型家族（阶段 4 新增）
   * 
   * 根据模型名自动判断：
   * - 通义万相（wan）：支持参考图上传
   * - GPT Image（gpt-image）：不支持参考图
   * - Gemini（gemini）：取决于代理是否支持 inlineData
   * - 硅基流动（其他）：不支持参考图
   */
  private detectModelFamily(model: string): {
    family: 'wanxiang' | 'gpt-image' | 'gemini' | 'siliconflow' | 'other';
    supportsReferenceImage: boolean;
  } {
    const lower = model.toLowerCase();

    if (lower.includes('wan')) {
      // 通义万相：wan2.6-image, wan2.7-image 等
      return { family: 'wanxiang', supportsReferenceImage: true };
    }

    if (lower.includes('gpt-image')) {
      // GPT Image 系列：gpt-image-2, gpt-image-2-2026-04-21 等
      return { family: 'gpt-image', supportsReferenceImage: false };
    }

    if (lower.includes('gemini')) {
      // Gemini：取决于代理是否支持 inlineData
      return { family: 'gemini', supportsReferenceImage: false };
    }

    if (lower.includes('silicon') || lower.includes('flux') || lower.includes('sd')) {
      // 硅基流动 / FLUX / Stable Diffusion
      return { family: 'siliconflow', supportsReferenceImage: false };
    }

    return { family: 'other', supportsReferenceImage: false };
  }

  /**
   * OpenAI 格式生图 API 调用
   * 
   * 适用：DALL-E 2/3、gpt-image-2、硅基流动、通义万相（兼容模式）
   * Endpoint: POST /images/generations
   */
  private async callOpenAIFormat(
    prompt: string,
    model: string,
    width?: number,
    height?: number
  ): Promise<GenerateImageResult> {
    // 构建 size 参数
    let size: string | undefined;
    if (width && height) {
      size = `${width}x${height}`;
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: 1,
    };
    if (size) {
      body.size = size;
    }

    const response = await fetch(`${this.config.apiBaseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();

    // 解析 OpenAI 格式响应
    // { data: [{ url: "...", revised_prompt: "..." }] }
    const imageData = data.data?.[0];
    if (!imageData) {
      throw new ImageGenerationError('API 响应中未找到图片数据', 'unknown');
    }

    // 获取图片 URL（可能是 url 或 b64_json）
    let imageUrl: string | undefined = imageData.url;
    let imageBlob: Blob;

    if (imageUrl) {
      // 通过 URL 下载图片
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new ImageGenerationError(`下载图片失败: ${imageResponse.status}`, 'network');
      }
      imageBlob = await imageResponse.blob();
    } else if (imageData.b64_json) {
      // base64 编码的图片
      imageBlob = this.base64ToBlob(imageData.b64_json, 'image/png');
      imageUrl = `data:image/png;base64,${imageData.b64_json}`;
    } else {
      throw new ImageGenerationError('API 响应中未找到图片 URL 或 base64 数据', 'unknown');
    }

    // 获取图片尺寸（如果 API 返回）
    const resultWidth = width || 1024;
    const resultHeight = height || 1024;

    return {
      blob: imageBlob,
      width: resultWidth,
      height: resultHeight,
      mimeType: imageBlob.type || 'image/png',
    };
  }

  /**
   * Gemini 格式生图 API 调用
   * 
   * 适用：gemini-2.5-flash-image、gemini-3-pro-image 等
   * Endpoint: POST /models/{model}:generateContent
   */
  private async callGeminiFormat(
    prompt: string,
    model: string,
    width?: number,
    height?: number
  ): Promise<GenerateImageResult> {
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['Text', 'Image'],
      } as Record<string, unknown>,
    };

    // 如果有尺寸要求，加入 generationConfig
    if (width && height) {
      body.generationConfig.imageGenerationConfig = {
        aspectRatio: this.calculateAspectRatio(width, height),
      };
    }

    const response = await fetch(
      `${this.config.apiBaseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();

    // 解析 Gemini 格式响应
    // { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: base64 } }] } }] }
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // 找到图片部分
    const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData);
    if (!imagePart || !imagePart.inlineData) {
      throw new ImageGenerationError('API 响应中未找到图片数据', 'unknown');
    }

    const { mimeType, data: base64Data } = imagePart.inlineData;
    const imageBlob = this.base64ToBlob(base64Data, mimeType || 'image/png');

    // 尝试从响应中提取尺寸信息（Gemini 不直接返回，用请求的或默认值）
    const resultWidth = width || 1024;
    const resultHeight = height || 1024;

    return {
      blob: imageBlob,
      width: resultWidth,
      height: resultHeight,
      mimeType: mimeType || 'image/png',
    };
  }

  /**
   * 通义万相生图 API 调用（支持参考图）
   * 
   * 适用：wan2.6-image, wan2.7-image 等
   * Endpoint: POST /api/v1/services/aigc/multimodal-generation/generation
   * 支持最多 9 张参考图（Base64 编码）
   */
  private async callWanxiangFormat(
    prompt: string,
    model: string,
    referenceImage?: string,
    width?: number,
    height?: number
  ): Promise<GenerateImageResult> {
    // 构建多模态消息内容
    const content: Array<{ text?: string; image?: string }> = [];

    // 如果有参考图，先传图片
    if (referenceImage) {
      console.log('[ImageService] 通义万相：上传参考图，长度:', referenceImage.length);
      content.push({ image: referenceImage });
    }

    // 再传文字 prompt
    content.push({ text: prompt });

    const body = {
      model,
      input: {
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      },
    };

    console.log('[ImageService] 通义万相请求体:', JSON.stringify({
      model,
      input: {
        messages: [{
          role: 'user',
          content: content.map(c => c.image ? { image: '[base64...]' } : c),
        }],
      },
    }, null, 2));

    const response = await fetch(
      `${this.config.apiBaseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    console.log('[ImageService] 通义万相原始响应:', JSON.stringify(data, null, 2));

    // 解析通义万相响应
    // 格式：{ output: { choices: [{ message: { content: [{ image: 'base64...' }] } }] } }
    const choices = data.output?.choices || data.choices;
    if (!choices || !choices[0]) {
      console.error('[ImageService] 通义万相响应中未找到图片数据:', data);
      throw new ImageGenerationError('API 响应中未找到图片数据', 'unknown');
    }

    const messageContent = choices[0].message?.content || choices[0].content;
    if (!messageContent || !Array.isArray(messageContent)) {
      throw new ImageGenerationError('API 响应格式异常', 'unknown');
    }

    // 找到图片部分
    const imagePart = messageContent.find((c: Record<string, unknown>) => c.image);
    if (!imagePart || !imagePart.image) {
      // 检查是否有文本说明
      const textPart = messageContent.find((c: Record<string, unknown>) => c.text);
      if (textPart?.text) {
        console.error('[ImageService] 通义万相返回了文本:', textPart.text);
        throw new ImageGenerationError(`API 未返回图片: ${textPart.text.substring(0, 100)}`, 'unknown');
      }
      throw new ImageGenerationError('API 响应中未找到图片数据', 'unknown');
    }

    const base64Data = imagePart.image;
    console.log('[ImageService] 通义万相图片 base64 长度:', base64Data.length);

    const imageBlob = this.base64ToBlob(base64Data, 'image/png');

    const resultWidth = width || 1024;
    const resultHeight = height || 1024;

    return {
      blob: imageBlob,
      width: resultWidth,
      height: resultHeight,
      mimeType: 'image/png',
    };
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text().catch(() => '无法读取错误信息');
    let errorData: Record<string, unknown> = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      // 不是 JSON，使用原始文本
    }

    const errorMessage = 
      (errorData.error as Record<string, string>)?.message ||
      errorData.message ||
      errorText ||
      `HTTP ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      throw new ImageGenerationError(`认证失败: ${errorMessage}`, 'auth', response.status);
    }
    if (response.status === 429) {
      throw new ImageGenerationError(`请求过于频繁: ${errorMessage}`, 'rate_limit', response.status);
    }
    if (response.status === 400 && errorMessage.toLowerCase().includes('safety')) {
      throw new ImageGenerationError(`内容审核未通过: ${errorMessage}`, 'content_policy', response.status);
    }
    if (response.status >= 500) {
      throw new ImageGenerationError(`服务器错误: ${errorMessage}`, 'unknown', response.status);
    }

    throw new ImageGenerationError(`请求失败: ${errorMessage}`, 'unknown', response.status);
  }

  /**
   * 计算宽高比（用于 Gemini）
   */
  private calculateAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    if (Math.abs(ratio - 1) < 0.1) return '1:1';
    if (Math.abs(ratio - 0.75) < 0.1) return '3:4';
    if (Math.abs(ratio - 1.33) < 0.1) return '4:3';
    if (Math.abs(ratio - 0.56) < 0.1) return '9:16';
    if (Math.abs(ratio - 1.78) < 0.1) return '16:9';
    return '1:1';
  }

  // ================================================================
  // 二、缩略图生成
  // ================================================================

  /**
   * 创建缩略图
   * 
   * 使用前端 canvas 压缩图片到指定宽度，控制单张缩略图 < 200KB
   */
  async createThumbnail(blob: Blob, options: { width: number; quality?: number }): Promise<Blob> {
    const { width: targetWidth, quality = 0.8 } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // 计算缩放后的尺寸（保持宽高比）
        const scale = targetWidth / img.width;
        const targetHeight = Math.round(img.height * scale);

        // 创建 canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 canvas 上下文'));
          return;
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // 导出为 blob
        canvas.toBlob(
          (thumbnailBlob) => {
            if (thumbnailBlob) {
              resolve(thumbnailBlob);
            } else {
              reject(new Error('缩略图生成失败'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };

      img.src = url;
    });
  }

  // ================================================================
  // 三、R2 上传（预留，阶段 2 实现）
  // ================================================================

  /**
   * 为角色生成图片 —— 自动拼接角色提示词并传入参考图
   * 
   * 这是 AI 自主触发生图的主要入口。系统会自动：
   * 1. 将 characterPositivePrompt 拼接到 scenePrompt 前面
   * 2. 使用 characterNegativePrompt 作为 negative prompt
   * 3. 传入 faceReferenceImage（系统会根据模型家族自动决定是否使用）
   */
  async generateForCharacter(options: CharacterImageOptions): Promise<ImageRecord> {
    const {
      scenePrompt,
      characterPositivePrompt,
      characterNegativePrompt,
      faceReferenceImage,
      characterId,
      messageId,
      width,
      height,
      model,
    } = options;

    // 1. 拼接最终 prompt：角色固定特征 + AI 场景描述
    const finalPrompt = characterPositivePrompt
      ? `${characterPositivePrompt}, ${scenePrompt}`
      : scenePrompt;

    // 2. 使用角色负面提示词
    const finalNegativePrompt = characterNegativePrompt || undefined;

    console.log('[ImageService.generateForCharacter] 最终 prompt:', finalPrompt);
    console.log('[ImageService.generateForCharacter] negative prompt:', finalNegativePrompt);
    console.log('[ImageService.generateForCharacter] 有参考图:', !!faceReferenceImage);

    // 3. 调用底层生图方法，传入参考图
    return this.generateImage({
      prompt: finalPrompt,
      negativePrompt: finalNegativePrompt,
      width,
      height,
      model,
      characterId,
      messageId,
      referenceImage: faceReferenceImage,
    });
  }

  /**
   * 
   * 阶段 1：空实现，返回 base64
   * 阶段 2：接入 R2 后，改为实际上传
   */
  async uploadToR2(blob: Blob, _mimeType: string): Promise<string> {
    // 阶段 1：直接返回 base64，不上传
    console.log('[ImageService] uploadToR2 为预留接口，当前返回 base64');
    return this.blobToBase64(blob);
  }

  /**
   * 获取预签名 URL（预留接口）
   */
  async getPresignedUrl(_filename: string, _mimeType: string): Promise<string> {
    // 阶段 1：空实现
    throw new Error('R2 预签名 URL 功能尚未实现');
  }

  // ================================================================
  // 四、存储限额查询
  // ================================================================

  /**
   * 计算指定角色的所有图片总大小（字节）
   */
  static async getTotalImageSize(characterId: string): Promise<number> {
    const images = await getImageRecordsByCharacter(characterId);
    return images.reduce((total, img) => total + (img.size || 0), 0);
  }

  /**
   * 计算所有图片总大小（字节）
   */
  static async getGlobalTotalImageSize(): Promise<number> {
    // 由于 IndexedDB 没有直接的全表聚合查询，需要遍历所有角色
    // 这里提供一个简化版本，实际使用时可以优化
    const { getAllCharacters } = await import('@/db');
    const characters = await getAllCharacters();
    let total = 0;
    for (const character of characters) {
      total += await ImageService.getTotalImageSize(character.id);
    }
    return total;
  }

  /**
   * 格式化大小为人类可读字符串
   */
  static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  // ================================================================
  // 五、工具方法
  // ================================================================

  /**
   * Blob 转 Base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Base64 转 Blob
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    // 移除 data URL 前缀（如果存在）
    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

// ==================== 便捷导出 ====================

/**
 * 快速生成图片（无需手动创建 ImageService 实例）
 */
export async function generateImage(
  config: ImageGenerationConfig,
  options: GenerateImageOptions
): Promise<ImageRecord> {
  const service = ImageService.fromConfig(config);
  if (!service) {
    throw new ImageGenerationError('生图功能未启用或配置不完整', 'unknown');
  }
  return service.generateImage(options);
}
