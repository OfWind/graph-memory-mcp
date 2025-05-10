import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';
import { PATHS } from './storage-manager.js';

// --- 配置与常量 ---
const OUTLINE_JSON_PATH = process.env.OUTLINE_JSON_PATH || PATHS.OUTLINE_JSON_FILE;
const LOG_FILE_PATH = PATHS.OUTLINE_LOG_FILE;

// --- 日志功能 ---
async function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = data
    ? `${timestamp} [OUTLINE-TOOLS-V2] ${message}: ${JSON.stringify(data, null, 2)}`
    : `${timestamp} [OUTLINE-TOOLS-V2] ${message}`;

  console.log(logMessage);

  try {
    await fs.appendFile(LOG_FILE_PATH, logMessage + '\n');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

// --- 接口定义 ---
// 基础节点结构
interface BaseNode {
  title: string;    // 标题
  metadata?: Record<string, any>; // 存储原YAML中的其他字段
}

interface VolumeNode extends BaseNode {
  type: 'volume';
  // 以下字段会存储在metadata中
  // 章节数目?: number;
  // 核心矛盾?: string;
  // 主要反派?: string;
  // 剧情结局?: string[];
}

interface ActNode extends BaseNode {
  type: 'act';
  // 以下字段会存储在metadata中
  // 章节数目?: number;
  // 简介?: string;
}

interface PlotPointNode extends BaseNode {
  type: 'plot_point';
  // 以下字段会存储在metadata中
  // 章节数目?: string;
  // 具体章节?: string;
  // 剧情?: string;
  // 爽点设置?: string;
}

interface ChapterNode extends BaseNode {
  type: 'chapter';
  index: number; // 全局章节索引
  // 以下字段会存储在metadata中
  // 剧情说明?: string;
  // 情绪点?: string;
  // 章末悬念?: string;
  // 剧情点?: string[];
}

type OutlineNode = VolumeNode | ActNode | PlotPointNode | ChapterNode;

// 方案 的主要数据结构
interface OutlineData  {
  volumes: Record<string, VolumeNode>;        // 键: 路径 (e.g., "/v1")
  acts: Record<string, ActNode>;              // 键: 路径 (e.g., "/v1/a1")
  plotPoints: Record<string, PlotPointNode>;  // 键: 路径 (e.g., "/v1/a1/p1")
  chapters: Record<string, ChapterNode>;      // 键: 路径 (e.g., "/v1/a1/p1/c1")
}

// 原YAML结构接口
interface YamlChapter {
  chapter_name: string;
  chapter_index: number;
  剧情说明?: string;
  情绪点?: string;
  章末悬念?: string;
  剧情点?: string[];
  [key: string]: any;
}

interface YamlPlotPoint {
  plot_point_name: string;
  章节数目?: string;
  具体章节?: string;
  剧情?: string;
  爽点设置?: string;
  chapters?: YamlChapter[];
  [key: string]: any;
}

interface YamlAct {
  act_name: string;
  章节数目?: number;
  简介?: string;
  plot_points?: YamlPlotPoint[];
  [key: string]: any;
}

interface YamlVolume {
  volume: string;
  章节数目?: number;
  核心矛盾?: string;
  主要反派?: string;
  剧情结局?: string[];
  acts?: YamlAct[];
  [key: string]: any;
}

interface YamlOutline {
  outline: YamlVolume[];
}

// --- 大纲管理类 ---
class OutlineManager  {
  private data: OutlineData  = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
  private dataLoaded = false;

  constructor(private filePath: string) {
    log(`OutlineManager  initialized with file path: ${this.filePath}`);
  }

  // --- 数据加载和保存 ---
  
  async loadData(): Promise<void> {
    if (this.dataLoaded) return;
    
    await log('Attempting to load outline data from JSON file.');
    try {
      await log(`Reading file: ${this.filePath}`);
      const fileContent = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(fileContent) as OutlineData ;
      
      // 确保所有字典都存在，即使文件只部分形成
      this.data.volumes = this.data.volumes || {};
      this.data.acts = this.data.acts || {};
      this.data.plotPoints = this.data.plotPoints || {};
      this.data.chapters = this.data.chapters || {};
      
      this.dataLoaded = true;
      await log('Outline data loaded successfully.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        await log('Outline file not found. Initializing with empty structure.');
        this.data = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
        this.dataLoaded = true;
        await this.saveData(); // 创建空文件
      } else {
        await log('Error loading outline data:', error);
        this.data = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
        this.dataLoaded = true;
        console.error("Failed to load or initialize outline data. Using empty structure.", error);
      }
    }
  }

  async saveData(): Promise<void> {
    await log('Attempting to save outline data to JSON file.');
    try {
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
      const jsonContent = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.filePath, jsonContent, 'utf8');
      await log('Outline data saved successfully.');
    } catch (error) {
      await log('Error saving outline data:', error);
      console.error(`Error writing outline file: ${error}`);
      throw error;
    }
  }

  // --- 路径和类型工具方法 ---
  
  private getNodeTypeFromPath(nodePath: string): OutlineNode['type'] | null {
    const parts = nodePath.split('/').filter(p => p);
    if (parts.length === 1 && parts[0].startsWith('v')) return 'volume';
    if (parts.length === 2 && parts[1].startsWith('a')) return 'act';
    if (parts.length === 3 && parts[2].startsWith('p')) return 'plot_point';
    if (parts.length === 4 && parts[3].startsWith('c')) return 'chapter';
    return null;
  }

  private getDictionaryByType(type: OutlineNode['type']): Record<string, OutlineNode> {
    switch (type) {
      case 'volume': return this.data.volumes as Record<string, OutlineNode>;
      case 'act': return this.data.acts as Record<string, OutlineNode>;
      case 'plot_point': return this.data.plotPoints as Record<string, OutlineNode>;
      case 'chapter': return this.data.chapters as Record<string, OutlineNode>;
      default: throw new Error(`Invalid node type: ${type}`);
    }
  }

  private getParentPath(nodePath: string): string {
    const parts = nodePath.split('/');
    if (parts.length <= 2) return '/';
    return parts.slice(0, -1).join('/');
  }

  private async generateNextChildId(parentPath: string, childPrefix: 'v' | 'a' | 'p' | 'c'): Promise<number> {
    await this.loadData();
    const children = await this.getChildren(parentPath);
    let maxId = 0;
    
    children.forEach(child => {
      const childPath = child.path;
      const childIdPart = childPath.split('/').pop();
      if (childIdPart?.startsWith(childPrefix)) {
        const num = parseInt(childIdPart.substring(1), 10);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      }
    });
    
    return maxId + 1;
  }

  // --- 核心路径操作方法 ---
  
  async getNode(nodePath: string): Promise<(OutlineNode & { path: string }) | null> {
    await this.loadData();
    const type = this.getNodeTypeFromPath(nodePath);
    
    if (!type) {
      await log('getNode failed: Invalid path format', { path: nodePath });
      return null;
    }
    
    const dictionary = this.getDictionaryByType(type);
    const node = dictionary[nodePath];
    
    if (!node) {
      await log('getNode failed: Node not found', { path: nodePath, type });
      return null;
    }
    
    await log('getNode success', { path: nodePath });
    return { ...node, path: nodePath };
  }

  async getChildren(parentPath: string): Promise<(OutlineNode & { path: string })[]> {
    await this.loadData();
    const children: (OutlineNode & { path: string })[] = [];
    const parentDepth = parentPath === '/' ? 0 : parentPath.split('/').filter(p => p).length;

    for (const dict of [this.data.volumes, this.data.acts, this.data.plotPoints, this.data.chapters]) {
      for (const nodePath in dict) {
        if (nodePath.startsWith(parentPath === '/' ? '/' : parentPath + '/') && nodePath !== parentPath) {
          const nodeDepth = nodePath.split('/').filter(p => p).length;
          if (nodeDepth === parentDepth + 1) {
            children.push({ ...(dict[nodePath] as OutlineNode), path: nodePath });
          }
        }
      }
    }
    
    await log('getChildren success', { parentPath, count: children.length });
    return children;
  }

  async addNode(
    parentPath: string, 
    nodeData: Partial<OutlineNode> & { 
      type: OutlineNode['type'], 
      title: string, 
      index?: number, 
      metadata?: Record<string, any> 
    }
  ): Promise<string | null> {
    await this.loadData();
    const { type, title, index, metadata, ...restData } = nodeData;

    // 验证父路径存在（除非在根目录添加卷）
    if (parentPath !== '/' && !(await this.getNode(parentPath))) {
      await log('addNode failed: Parent path does not exist', { parentPath });
      return null;
    }

    // 确定子前缀和预期的父类型
    let childPrefix: 'v' | 'a' | 'p' | 'c';
    let expectedParentType: OutlineNode['type'] | 'root';
    
    switch (type) {
      case 'volume': 
        childPrefix = 'v'; 
        expectedParentType = 'root'; 
        break;
      case 'act': 
        childPrefix = 'a'; 
        expectedParentType = 'volume'; 
        break;
      case 'plot_point': 
        childPrefix = 'p'; 
        expectedParentType = 'act'; 
        break;
      case 'chapter': 
        childPrefix = 'c'; 
        expectedParentType = 'plot_point'; 
        break;
      default:
        await log('addNode failed: Invalid node type specified', { type });
        return null;
    }

    // 验证父节点类型
    const parentType = parentPath === '/' ? 'root' : this.getNodeTypeFromPath(parentPath);
    if (parentType !== expectedParentType) {
      await log('addNode failed: Cannot add node type to this parent type', { 
        nodeType: type, 
        parentPath, 
        parentType, 
        expectedParentType 
      });
      return null;
    }

    // 生成新路径 - 章节类型特殊处理
    let newNodePath: string;
    
    if (type === 'chapter') {
      // 章节类型使用全局章节索引
      if (index === undefined) {
        await log('addNode failed: Chapter index is required', { nodeData });
        return null;
      }
      
      // 使用全局章节索引构建路径
      newNodePath = `${parentPath}/c${index}`;
      
      // 检查是否已存在此路径（可能在不同情节点下有相同索引的章节）
      const existingNode = this.data.chapters[newNodePath];
      if (existingNode) {
        await log('addNode failed: Chapter path already exists', { 
          newNodePath, 
          existingChapter: existingNode.title,
          requestedChapter: title
        });
        return null;
      }
    } else {
      // 非章节类型仍使用自增ID
      const nextId = await this.generateNextChildId(parentPath, childPrefix);
      newNodePath = parentPath === '/' ? `/${childPrefix}${nextId}` : `${parentPath}/${childPrefix}${nextId}`;
    }

    // 构建完整的节点对象
    const newNode: OutlineNode = {
      type,
      title,
      metadata: { ...metadata, ...restData },
    } as OutlineNode;

    // 添加特定类型所需的字段
    if (newNode.type === 'chapter') {
      (newNode as ChapterNode).index = index!;
    }

    // 添加到正确的字典中
    const dictionary = this.getDictionaryByType(type);
    dictionary[newNodePath] = newNode;
    await log('addNode success', { newNodePath, type });
    await this.saveData(); // 成功添加后保存
    
    return newNodePath;
  }

  async updateNode(nodePath: string, newData: Partial<OutlineNode>): Promise<boolean> {
    await this.loadData();
    const type = this.getNodeTypeFromPath(nodePath);
    
    if (!type) {
      await log('updateNode failed: Invalid path format', { path: nodePath });
      return false;
    }
    
    const dictionary = this.getDictionaryByType(type);
    const existingNode = dictionary[nodePath];

    if (!existingNode) {
      await log('updateNode failed: Node not found', { path: nodePath });
      return false;
    }

    // 合并新数据 - 修复解构赋值
    const { type: newType, title: newTitle, metadata: newMetadata, ...restNewData } = newData;
    
    // 提取特定类型的数据
    let newIndex: number | undefined;
    if ('index' in newData) {
      newIndex = (newData as any).index;
    }

    // 不允许更改节点类型
    if (newTitle !== undefined) existingNode.title = newTitle;
    if (existingNode.type === 'chapter' && newIndex !== undefined) {
      (existingNode as ChapterNode).index = newIndex;
    }

    // 合并metadata
    existingNode.metadata = {
      ...(existingNode.metadata || {}),
      ...(newMetadata || {}),
      ...restNewData // 将其他字段合并到metadata
    };

    await log('updateNode success', { path: nodePath });
    await this.saveData();
    return true;
  }

  async deleteNode(nodePath: string): Promise<boolean> {
    await this.loadData();
    const type = this.getNodeTypeFromPath(nodePath);
    
    if (!type) {
      await log('deleteNode failed: Invalid path format', { path: nodePath });
      return false;
    }
    
    const dictionary = this.getDictionaryByType(type);

    if (!dictionary[nodePath]) {
      await log('deleteNode failed: Node not found', { path: nodePath });
      return false;
    }

    // 删除节点本身
    delete dictionary[nodePath];
    let deletedCount = 1;
    await log('deleteNode: Deleted target node', { path: nodePath });

    // 递归删除子节点
    const prefixToDelete = nodePath + '/';
    for (const dict of [this.data.volumes, this.data.acts, this.data.plotPoints, this.data.chapters]) {
      for (const path in dict) {
        if (path.startsWith(prefixToDelete)) {
          delete dict[path];
          deletedCount++;
          await log('deleteNode: Deleted child node', { path });
        }
      }
    }

    await log('deleteNode success', { path: nodePath, totalDeleted: deletedCount });
    await this.saveData();
    return true;
  }

  // --- 特定辅助方法（适配旧工具）---

  async getAllChaptersSorted(): Promise<(ChapterNode & { path: string })[]> {
    await this.loadData();
    const chapters = Object.entries(this.data.chapters).map(([path, node]) => ({ ...node, path }));
    chapters.sort((a, b) => a.index - b.index);
    return chapters;
  }

  async getChapterWindowByPath(centerChapterPath: string, windowSize: number = 2): Promise<(ChapterNode & { path: string })[]> {
    await log(`Getting chapter window by path - Center: ${centerChapterPath}, Size: ${windowSize}`);
    const type = this.getNodeTypeFromPath(centerChapterPath);
    
    if (type !== 'chapter') {
      await log('getChapterWindowByPath failed: Path is not a chapter path', { centerChapterPath });
      return [];
    }

    const allChaptersSorted = await this.getAllChaptersSorted();
    const centerIndexInArray = allChaptersSorted.findIndex(ch => ch.path === centerChapterPath);

    if (centerIndexInArray === -1) {
      await log('getChapterWindowByPath failed: Center chapter path not found in sorted list', { centerChapterPath });
      return [];
    }

    const startIndex = Math.max(0, centerIndexInArray - windowSize);
    const endIndex = Math.min(allChaptersSorted.length - 1, centerIndexInArray + windowSize);
    const result = allChaptersSorted.slice(startIndex, endIndex + 1);

    await log('getChapterWindowByPath success', { 
      centerChapterPath, 
      windowSize, 
      count: result.length, 
      indices: result.map(ch => ch.index) 
    });
    
    return result;
  }

  async getVolumeInfoByPath(volumePath: string): Promise<(VolumeNode & { path: string }) | null> {
    await log(`Getting volume info by path: ${volumePath}`);
    const node = await this.getNode(volumePath);
    
    if (node && node.type === 'volume') {
      return node as (VolumeNode & { path: string });
    }
    
    await log('getVolumeInfoByPath failed: Node not found or not a volume', { volumePath });
    return null;
  }

  async getChapterOutlineByPath(chapterPath: string): Promise<(ChapterNode & { path: string }) | null> {
    await log(`Getting chapter outline by path: ${chapterPath}`);
    const node = await this.getNode(chapterPath);
    
    if (node && node.type === 'chapter') {
      return node as (ChapterNode & { path: string });
    }
    
    await log('getChapterOutlineByPath failed: Node not found or not a chapter', { chapterPath });
    return null;
  }
  
  // --- 导入/迁移功能 ---
  
  // 处理YAML转换中的文件路径
  async convertYAMLToJSON(): Promise<boolean> {
    await log('Starting YAML to JSON conversion');
    
    try {
      // 读取YAML文件
      const yamlFilePath = process.env.OUTLINE_FILE_PATH || PATHS.OUTLINE_JSON_FILE;
      await log(`Reading YAML from: ${yamlFilePath}`);
      
      const fileContent = await fs.readFile(yamlFilePath, 'utf8');
      const yamlData = yaml.load(fileContent) as YamlOutline;
      
      // 重置现有数据
      this.data = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
      
      // 处理卷
      for (let volIdx = 0; volIdx < yamlData.outline.length; volIdx++) {
        const yamlVolume = yamlData.outline[volIdx];
        const volumePath = `/v${volIdx + 1}`;
        
        // 提取卷的元数据
        const { volume, acts, ...volumeMetadata } = yamlVolume;
        
        // 创建卷节点
        this.data.volumes[volumePath] = {
          type: 'volume',
          title: volume,
          metadata: volumeMetadata
        };
        
        await log(`Converted volume: ${volume} -> ${volumePath}`);
        
        // 处理幕
        if (acts) {
          for (let actIdx = 0; actIdx < acts.length; actIdx++) {
            const yamlAct = acts[actIdx];
            const actPath = `${volumePath}/a${actIdx + 1}`;
            
            // 提取幕的元数据
            const { act_name, plot_points, ...actMetadata } = yamlAct;
            
            // 创建幕节点
            this.data.acts[actPath] = {
              type: 'act',
              title: act_name,
              metadata: actMetadata
            };
            
            await log(`Converted act: ${act_name} -> ${actPath}`);
            
            // 处理情节点
            if (plot_points) {
              for (let ppIdx = 0; ppIdx < plot_points.length; ppIdx++) {
                const yamlPlotPoint = plot_points[ppIdx];
                const plotPointPath = `${actPath}/p${ppIdx + 1}`;
                
                // 提取情节点的元数据
                const { plot_point_name, chapters, ...plotPointMetadata } = yamlPlotPoint;
                
                // 创建情节点节点
                this.data.plotPoints[plotPointPath] = {
                  type: 'plot_point',
                  title: plot_point_name,
                  metadata: plotPointMetadata
                };
                
                await log(`Converted plot point: ${plot_point_name} -> ${plotPointPath}`);
                
                // 处理章节
                if (chapters) {
                  for (let chIdx = 0; chIdx < chapters.length; chIdx++) {
                    const yamlChapter = chapters[chIdx];
                    // 使用章节的全局索引，而不是循环索引
                    const chapterPath = `${plotPointPath}/c${yamlChapter.chapter_index}`;
                    
                    // 提取章节的元数据
                    const { chapter_name, chapter_index, ...chapterMetadata } = yamlChapter;
                    
                    // 创建章节节点
                    this.data.chapters[chapterPath] = {
                      type: 'chapter',
                      title: chapter_name,
                      index: chapter_index,
                      metadata: chapterMetadata
                    };
                    
                    await log(`Converted chapter: ${chapter_name} (${chapter_index}) -> ${chapterPath}`);
                  }
                }
              }
            }
          }
        }
      }
      
      // 保存转换后的JSON
      await this.saveData();
      await log('YAML to JSON conversion completed successfully');
      return true;
    } catch (error) {
      await log('Error during YAML to JSON conversion:', error);
      console.error('Failed to convert YAML to JSON:', error);
      return false;
    }
  }
}

// --- 实例化管理器 ---
const outlineManager = new OutlineManager (OUTLINE_JSON_PATH);

// --- 导出的工具函数 ---

export async function getNode(path: string): Promise<(OutlineNode & { path: string }) | null> {
  return outlineManager.getNode(path);
}

export async function getChildren(parentPath: string): Promise<(OutlineNode & { path: string })[]> {
  return outlineManager.getChildren(parentPath);
}

export async function addNode(
  parentPath: string, 
  nodeData: Partial<OutlineNode> & { 
    type: OutlineNode['type'], 
    title: string, 
    index?: number, 
    metadata?: Record<string, any> 
  }
): Promise<string | null> {
  return outlineManager.addNode(parentPath, nodeData);
}

export async function updateNode(path: string, newData: Partial<OutlineNode>): Promise<boolean> {
  return outlineManager.updateNode(path, newData);
}

export async function deleteNode(path: string): Promise<boolean> {
  return outlineManager.deleteNode(path);
}

export async function getVolumeInfoByPath(volumePath: string): Promise<(VolumeNode & { path: string }) | null> {
  return outlineManager.getVolumeInfoByPath(volumePath);
}

export async function getChapterWindowByPath(centerChapterPath: string, windowSize: number = 2): Promise<(ChapterNode & { path: string })[]> {
  return outlineManager.getChapterWindowByPath(centerChapterPath, windowSize);
}

export async function getChapterOutlineByPath(chapterPath: string): Promise<(ChapterNode & { path: string }) | null> {
  return outlineManager.getChapterOutlineByPath(chapterPath);
}

export async function convertYAMLToJSON(): Promise<boolean> {
  return outlineManager.convertYAMLToJSON();
}

// 导出一个工具集合
export const outlineTools = {
  getNode,
  getChildren,
  addNode,
  updateNode,
  deleteNode,
  getVolumeInfoByPath,
  getChapterWindowByPath,
  getChapterOutlineByPath,
  convertYAMLToJSON
};

// 记录模块完成加载
log('Module initialization complete (  Implementation)');

export default outlineTools;