import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.log(`ChapterSummaryManager initialized with file path: ${this.filePath}`);
  }

  // 初始化和加载数据
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 确保目录存在
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
      
      // 尝试读取现有文件
      try {
        const data = await fs.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(data) as ChapterSummaryStore;
        this.summaries = parsed.summaries || {};
      } catch (e) {
        console.log('No existing chapter summaries file found or invalid format, creating new store');
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
    
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  // 存储章节总结
  async storeSummary(chapterKey: string, summary: ChapterSummary): Promise<ChapterSummary> {
    await this.initialize();
    this.summaries[chapterKey] = summary;
    await this.save();
    return summary;
  }

  // 获取特定章节总结
  async getSummary(chapterKey: string): Promise<ChapterSummary | null> {
    await this.initialize();
    return this.summaries[chapterKey] || null;
  }

  // 获取所有章节总结
  async getAllSummaries(): Promise<Record<string, ChapterSummary>> {
    await this.initialize();
    return this.summaries;
  }

  // 删除章节总结
  async deleteSummary(chapterKey: string): Promise<boolean> {
    await this.initialize();
    if (this.summaries[chapterKey]) {
      delete this.summaries[chapterKey];
      await this.save();
      return true;
    }
    return false;
  }
}

// 确定存储文件路径
const defaultSummaryPath = process.env.CHAPTER_SUMMARY_PATH || 'chapter-summaries.json';

// 创建导出的单例实例
export const chapterSummaryManager = new ChapterSummaryManager(defaultSummaryPath);

export default chapterSummaryManager;