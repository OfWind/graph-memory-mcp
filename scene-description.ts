import { promises as fs } from 'fs';
import path from 'path';
import { PATHS } from './storage-manager.js';

// 场景描述类型
export enum SceneType {
  BATTLE = 'battle',
  DIALOGUE = 'dialogue',
  ENVIRONMENT = 'environment'
}

// 场景描述接口
export interface SceneDescription {
  type: SceneType;           // 场景类型：战斗、对话或环境
  context: string;           // 场景上下文，如"掌心雷"、"张三|李四"或"青丘山"
  content: string;           // 场景描述内容
  chapterReference?: string; // 可选的章节引用
}

// 场景描述存储结构
interface SceneDescriptionStore {
  descriptions: Record<string, SceneDescription[]>;  // key为场景类型
  lastUpdated: string;  // 最后更新时间
}

class SceneDescriptionManager {
  private filePath: string;
  private descriptions: Record<string, SceneDescription[]> = {
    [SceneType.BATTLE]: [],
    [SceneType.DIALOGUE]: [],
    [SceneType.ENVIRONMENT]: []
  };
  private initialized: boolean = false;

  constructor(filePath: string) {
    this.filePath = filePath;
    console.error(`SceneDescriptionManager initialized with file path: ${this.filePath}`);
  }

  // 初始化和加载数据
  private async initialize(forceReload: boolean = false): Promise<void> {
    if (this.initialized && !forceReload) return;
    
    console.error(`Loading scene descriptions from: ${this.filePath}`);
    
    try {
      // 确保目录存在
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
      
      // 尝试读取现有文件
      try {
        const data = await fs.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(data) as SceneDescriptionStore;
        this.descriptions = parsed.descriptions || {
          [SceneType.BATTLE]: [],
          [SceneType.DIALOGUE]: [],
          [SceneType.ENVIRONMENT]: []
        };
        
        // 确保所有类型都存在
        if (!this.descriptions[SceneType.BATTLE]) this.descriptions[SceneType.BATTLE] = [];
        if (!this.descriptions[SceneType.DIALOGUE]) this.descriptions[SceneType.DIALOGUE] = [];
        if (!this.descriptions[SceneType.ENVIRONMENT]) this.descriptions[SceneType.ENVIRONMENT] = [];
        
        console.error(`Successfully loaded scene descriptions: Battle=${this.descriptions[SceneType.BATTLE].length}, Dialogue=${this.descriptions[SceneType.DIALOGUE].length}, Environment=${this.descriptions[SceneType.ENVIRONMENT].length}`);
      } catch (e) {
        console.error(`No existing scene descriptions file found or invalid format: ${e instanceof Error ? e.message : String(e)}`);
        this.descriptions = {
          [SceneType.BATTLE]: [],
          [SceneType.DIALOGUE]: [],
          [SceneType.ENVIRONMENT]: []
        };
        // 创建初始文件
        await this.save();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing scene description manager:', error);
      throw error;
    }
  }

  // 保存数据到文件
  private async save(): Promise<void> {
    const store: SceneDescriptionStore = {
      descriptions: this.descriptions,
      lastUpdated: new Date().toISOString()
    };
    
    console.error(`Saving scene descriptions: Battle=${this.descriptions[SceneType.BATTLE].length}, Dialogue=${this.descriptions[SceneType.DIALOGUE].length}, Environment=${this.descriptions[SceneType.ENVIRONMENT].length}`);
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  // 添加场景描述
  async addSceneDescription(description: SceneDescription): Promise<SceneDescription> {
    await this.initialize();
    
    // 验证场景类型
    if (!Object.values(SceneType).includes(description.type)) {
      throw new Error(`Invalid scene type: ${description.type}`);
    }
    
    console.error(`Adding ${description.type} scene description: ${description.context}`);
    
    // 添加到相应类型的数组中
    this.descriptions[description.type].push(description);
    await this.save();
    return description;
  }

  // 获取特定类型的所有场景描述
  async getSceneDescriptionsByType(type: SceneType): Promise<SceneDescription[]> {
    await this.initialize(true); // 强制重新加载
    
    if (!Object.values(SceneType).includes(type)) {
      throw new Error(`Invalid scene type: ${type}`);
    }
    
    console.error(`Retrieved ${this.descriptions[type].length} ${type} scene descriptions`);
    return this.descriptions[type];
  }

  // 根据上下文搜索场景描述
  async searchSceneDescriptions(type: SceneType, contextQuery: string): Promise<SceneDescription[]> {
    await this.initialize(true); // 强制重新加载
    
    if (!Object.values(SceneType).includes(type)) {
      throw new Error(`Invalid scene type: ${type}`);
    }
    
    const results = this.descriptions[type].filter(desc => 
      desc.context.toLowerCase().includes(contextQuery.toLowerCase())
    );
    
    console.error(`Found ${results.length} ${type} scene descriptions matching query: ${contextQuery}`);
    return results;
  }

  // 删除场景描述
  async deleteSceneDescription(type: SceneType, index: number): Promise<boolean> {
    await this.initialize();
    
    if (!Object.values(SceneType).includes(type)) {
      throw new Error(`Invalid scene type: ${type}`);
    }
    
    if (index < 0 || index >= this.descriptions[type].length) {
      console.error(`Invalid index ${index} for ${type} scene descriptions`);
      return false;
    }
    
    console.error(`Deleting ${type} scene description at index ${index}`);
    this.descriptions[type].splice(index, 1);
    await this.save();
    return true;
  }

  // 获取所有场景描述
  async getAllSceneDescriptions(): Promise<Record<string, SceneDescription[]>> {
    await this.initialize(true); // 强制重新加载
    console.error(`Retrieved all scene descriptions`);
    return this.descriptions;
  }
}

// 使用统一的路径
const sceneDescriptionFilePath = process.env.SCENE_DESCRIPTION_PATH || PATHS.SCENE_DESCRIPTION_FILE;

// 创建导出的单例实例
export const sceneDescriptionManager = new SceneDescriptionManager(sceneDescriptionFilePath);

export default sceneDescriptionManager;