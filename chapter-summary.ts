import { promises as fs } from 'fs';
import path from 'path';
import { PATHS } from './storage-manager.js';

// 重新定义章节摘要的接口，使用英文字段名
export interface ChapterSummary {
  title: string;           // 章节标题
  threeActStructure: {     // 三幕结构
    beginning: string;     // 起
    middle: string;        // 承
    end: string;          // 转
  };
  plotSummary: string;     // 剧情概要
  keyLocations: string[];  // 关键地点
  worldBuilding: string[]; // 背景设定
  characterActions: string[]; // 主要人物行为
  keyItems: string[];      // 关键道具与能力
  endingSuspense: string;  // 结尾悬念
}

// 章节摘要存储结构
interface ChapterSummaryStore {
  summaries: Record<string, ChapterSummary>;  // key为章节索引或标识符
  lastUpdated: string;  // 最后更新时间
}

class ChapterSummaryManager {
  private filePath: string;
  private summaries: Record<string, ChapterSummary> = {};
  private initialized: boolean = false;

  constructor(filePath: string) {
    this.filePath = filePath;
    console.error(`ChapterSummaryManager initialized with file path: ${this.filePath}`);
  }

  // 初始化和加载数据
  private async initialize(forceReload: boolean = false): Promise<void> {
    if (this.initialized && !forceReload) return;
    
    console.error(`Loading chapter summaries from: ${this.filePath}`);
    
    try {
      // 确保目录存在
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
      
      // 尝试读取现有文件
      try {
        const data = await fs.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(data) as ChapterSummaryStore;
        this.summaries = parsed.summaries || {};
        console.error(`Successfully loaded ${Object.keys(this.summaries).length} chapter summaries`);
      } catch (e) {
        console.error(`No existing chapter summaries file found or invalid format: ${e instanceof Error ? e.message : String(e)}`);
        this.summaries = {};
        // 创建初始文件
        await this.save();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing chapter summary manager:', error);
      throw error;
    }
  }

  // 保存数据到文件
  private async save(): Promise<void> {
    const store: ChapterSummaryStore = {
      summaries: this.summaries,
      lastUpdated: new Date().toISOString()
    };
    
    console.error(`Saving ${Object.keys(this.summaries).length} summaries to: ${this.filePath}`);
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  // 存储章节总结
  async storeSummary(chapterKey: string, summary: ChapterSummary): Promise<ChapterSummary> {
    await this.initialize();
    console.error(`Storing summary for chapter ${chapterKey}: ${summary.title}`);
    this.summaries[chapterKey] = summary;
    await this.save();
    return summary;
  }

  // 获取特定章节总结
  async getSummary(chapterKey: string): Promise<ChapterSummary | null> {
    await this.initialize(true); // 强制重新加载
    const summary = this.summaries[chapterKey] || null;
    if (summary) {
      console.error(`Found summary for chapter ${chapterKey}: ${summary.title}`);
    } else {
      console.error(`No summary found for chapter ${chapterKey}`);
    }
    return summary;
  }

  // 获取所有章节总结
  async getAllSummaries(): Promise<Record<string, ChapterSummary>> {
    await this.initialize(true); // 强制重新加载
    console.error(`Retrieved ${Object.keys(this.summaries).length} chapter summaries`);
    return this.summaries;
  }

  // 删除章节总结
  async deleteSummary(chapterKey: string): Promise<boolean> {
    await this.initialize();
    if (this.summaries[chapterKey]) {
      console.error(`Deleting summary for chapter ${chapterKey}`);
      delete this.summaries[chapterKey];
      await this.save();
      return true;
    }
    return false;
  }
}

// 使用统一的路径
const summaryFilePath = process.env.CHAPTER_SUMMARY_PATH || PATHS.CHAPTER_SUMMARY_FILE;

// 创建导出的单例实例
export const chapterSummaryManager = new ChapterSummaryManager(summaryFilePath);

export default chapterSummaryManager;