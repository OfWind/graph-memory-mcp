import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';
import { PATHS } from './storage-manager.js';
import { log } from './logger.js';

// --- 配置与常量 ---
const OUTLINE_JSON_PATH = PATHS.OUTLINE_JSON_FILE;

// --- 日志功能 ---
async function logOutline(message: string, data?: any) {
  await log('OUTLINE-MANAGER', message, data);
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
    logOutline(`OutlineManager initialized with file path: ${this.filePath}`);
  }

  // --- 数据加载和保存 ---
  
  async loadData(): Promise<void> {
    // 移除条件检查，强制每次都重新加载
    // if (this.dataLoaded) return;
    
    await logOutline('Attempting to load outline data from JSON file.');
    try {
      await logOutline(`Reading file: ${this.filePath}`);
      const fileContent = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(fileContent) as OutlineData ;
      
      // 确保所有字典都存在，即使文件只部分形成
      this.data.volumes = this.data.volumes || {};
      this.data.acts = this.data.acts || {};
      this.data.plotPoints = this.data.plotPoints || {};
      this.data.chapters = this.data.chapters || {};
      
      // 不再设置 dataLoaded 标志
      // this.dataLoaded = true;
      await log('OUTLINE-MANAGER', 'Outline data loaded successfully.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        await log('OUTLINE-MANAGER', 'Outline file not found. Initializing with empty structure.');
        this.data = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
        // 不再设置 dataLoaded 标志
        // this.dataLoaded = true;
        await this.saveData(); // 创建空文件
      } else {
        await log('OUTLINE-MANAGER', 'Error loading outline data:', error);
        this.data = { volumes: {}, acts: {}, plotPoints: {}, chapters: {} };
        // 不再设置 dataLoaded 标志
        // this.dataLoaded = true;
        console.error("Failed to load or initialize outline data. Using empty structure.", error);
      }
    }
  }

  async saveData(): Promise<void> {
    await log('OUTLINE-MANAGER', 'Attempting to save outline data to JSON file.');
    try {
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
      const jsonContent = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.filePath, jsonContent, 'utf8');
      await log('OUTLINE-MANAGER', 'Outline data saved successfully.');
    } catch (error) {
      await log('OUTLINE-MANAGER', 'Error saving outline data:', error);
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
    
    // 处理可能的章节索引引用
    let resolvedPath = nodePath;
    if (/^c?\d+$/.test(nodePath)) {
      const chapterPath = await this.resolveChapterReference(nodePath);
      if (chapterPath) {
        resolvedPath = chapterPath;
      } else {
        await log('OUTLINE-MANAGER', 'getNode failed: Cannot resolve chapter reference', { reference: nodePath });
        return null;
      }
    }
    
    const type = this.getNodeTypeFromPath(resolvedPath);
    
    if (!type) {
      await log('OUTLINE-MANAGER', 'getNode failed: Invalid path format', { path: resolvedPath });
      return null;
    }
    
    const dictionary = this.getDictionaryByType(type);
    const node = dictionary[resolvedPath];
    
    if (!node) {
      await log('OUTLINE-MANAGER', 'getNode failed: Node not found', { path: resolvedPath });
      return null;
    }
    
    await log('OUTLINE-MANAGER', 'getNode success', { path: resolvedPath });
    return { ...node, path: resolvedPath };
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
    
    await log('OUTLINE-MANAGER', 'getChildren success', { parentPath, count: children.length });
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
      await log('OUTLINE-MANAGER', 'addNode failed: Parent path does not exist', { parentPath });
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
        await log('OUTLINE-MANAGER', 'addNode failed: Invalid node type specified', { type });
        return null;
    }

    // 验证父节点类型
    const parentType = parentPath === '/' ? 'root' : this.getNodeTypeFromPath(parentPath);
    if (parentType !== expectedParentType) {
      await log('OUTLINE-MANAGER', 'addNode failed: Cannot add node type to this parent type', { 
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
        await log('OUTLINE-MANAGER', 'addNode failed: Chapter index is required', { nodeData });
        return null;
      }
      
      // 使用全局章节索引构建路径
      newNodePath = `${parentPath}/c${index}`;
      
      // 检查是否已存在此路径（可能在不同情节点下有相同索引的章节）
      const existingNode = this.data.chapters[newNodePath];
      if (existingNode) {
        await log('OUTLINE-MANAGER', 'addNode failed: Chapter path already exists', { 
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
    await log('OUTLINE-MANAGER', 'addNode success', { newNodePath, type });
    await this.saveData(); // 成功添加后保存
    
    return newNodePath;
  }

  async updateNode(nodePath: string, newData: Partial<OutlineNode>): Promise<boolean> {
    await this.loadData();
    
    // 处理可能的章节索引引用
    let resolvedPath = nodePath;
    if (/^c?\d+$/.test(nodePath)) {
      const chapterPath = await this.resolveChapterReference(nodePath);
      if (chapterPath) {
        resolvedPath = chapterPath;
      } else {
        await log('OUTLINE-MANAGER', 'updateNode failed: Cannot resolve chapter reference', { reference: nodePath });
        return false;
      }
    }
    
    // 使用原有逻辑
    const type = this.getNodeTypeFromPath(resolvedPath);
    
    if (!type) {
      await log('OUTLINE-MANAGER', 'updateNode failed: Invalid path format', { path: resolvedPath });
      return false;
    }
    
    const dictionary = this.getDictionaryByType(type);
    const existingNode = dictionary[resolvedPath];

    if (!existingNode) {
      await log('OUTLINE-MANAGER', 'updateNode failed: Node not found', { path: resolvedPath });
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

    await log('OUTLINE-MANAGER', 'updateNode success', { path: resolvedPath });
    await this.saveData();
    return true;
  }

  async deleteNode(nodePath: string): Promise<boolean> {
    await this.loadData();
    
    // 处理可能的章节索引引用
    let resolvedPath = nodePath;
    if (/^c?\d+$/.test(nodePath)) {
      const chapterPath = await this.resolveChapterReference(nodePath);
      if (chapterPath) {
        resolvedPath = chapterPath;
      } else {
        await log('OUTLINE-MANAGER', 'deleteNode failed: Cannot resolve chapter reference', { reference: nodePath });
        return false;
      }
    }
    
    // 使用原有逻辑
    const type = this.getNodeTypeFromPath(resolvedPath);
    
    if (!type) {
      await log('OUTLINE-MANAGER', 'deleteNode failed: Invalid path format', { path: resolvedPath });
      return false;
    }
    
    const dictionary = this.getDictionaryByType(type);

    if (!dictionary[resolvedPath]) {
      await log('OUTLINE-MANAGER', 'deleteNode failed: Node not found', { path: resolvedPath });
      return false;
    }

    // 删除节点本身
    delete dictionary[resolvedPath];
    let deletedCount = 1;
    await log('OUTLINE-MANAGER', 'deleteNode: Deleted target node', { path: resolvedPath });

    // 递归删除子节点
    const prefixToDelete = resolvedPath + '/';
    for (const dict of [this.data.volumes, this.data.acts, this.data.plotPoints, this.data.chapters]) {
      for (const path in dict) {
        if (path.startsWith(prefixToDelete)) {
          delete dict[path];
          deletedCount++;
          await log('OUTLINE-MANAGER','deleteNode: Deleted child node', { path });
        }
      }
    }

    await log('OUTLINE-MANAGER','deleteNode success', { path: resolvedPath, totalDeleted: deletedCount });
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

  async getChapterWindowByPath(centerChapterRef: string, windowSize: number = 2): Promise<(ChapterNode & { path: string })[]> {
    await log('OUTLINE-MANAGER', `Getting chapter window by reference - Center: ${centerChapterRef}, Size: ${windowSize}`);
    
    // 解析章节引用（可以是索引或完整路径）
    let centerChapterPath = centerChapterRef;
    if (/^c?\d+$/.test(centerChapterRef)) {
      const resolvedPath = await this.resolveChapterReference(centerChapterRef);
      if (resolvedPath) {
        centerChapterPath = resolvedPath;
      } else {
        await log('OUTLINE-MANAGER', 'getChapterWindowByPath failed: Cannot resolve chapter reference', { reference: centerChapterRef });
        return [];
      }
    }
    
    const type = this.getNodeTypeFromPath(centerChapterPath);
    if (type !== 'chapter') {
      await log('OUTLINE-MANAGER', 'getChapterWindowByPath failed: Path is not a chapter path', { centerChapterPath });
      return [];
    }

    // 使用原有逻辑
    const allChaptersSorted = await this.getAllChaptersSorted();
    const centerIndexInArray = allChaptersSorted.findIndex(ch => ch.path === centerChapterPath);

    if (centerIndexInArray === -1) {
      await log('OUTLINE-MANAGER', 'getChapterWindowByPath failed: Center chapter path not found in sorted list', { centerChapterPath });
      return [];
    }

    const startIndex = Math.max(0, centerIndexInArray - windowSize);
    const endIndex = Math.min(allChaptersSorted.length - 1, centerIndexInArray + windowSize);
    const result = allChaptersSorted.slice(startIndex, endIndex + 1);

    await log('OUTLINE-MANAGER', 'getChapterWindowByPath success', { 
      centerChapterPath, 
      windowSize, 
      count: result.length, 
      indices: result.map(ch => ch.index) 
    });
    
    return result;
  }

  async getVolumeInfoByPath(volumePath: string): Promise<(VolumeNode & { path: string }) | null> {
    await log('OUTLINE-MANAGER',`Getting volume info by path: ${volumePath}`);
    const node = await this.getNode(volumePath);
    
    if (node && node.type === 'volume') {
      return node as (VolumeNode & { path: string });
    }
    
    await log('OUTLINE-MANAGER','getVolumeInfoByPath failed: Node not found or not a volume', { volumePath });
    return null;
  }

  // --- 修改获取章节信息的方法 ---
  async getChapterOutlineByPath(chapterRef: string): Promise<(ChapterNode & { path: string }) | null> {
    await log('OUTLINE-MANAGER', `Getting chapter outline by reference: ${chapterRef}`);
    
    // 解析章节引用并获取节点
    const node = await this.getNode(chapterRef);
    
    if (node && node.type === 'chapter') {
      return node as (ChapterNode & { path: string });
    }
    
    await log('OUTLINE-MANAGER', 'getChapterOutlineByPath failed: Node not found or not a chapter', { chapterRef });
    return null;
  }
  
  // --- 根据索引查找章节路径的辅助方法 ---
  private async getChapterPathByIndex(chapterIndex: number): Promise<string | null> {
    await this.loadData();
    for (const [path, chapter] of Object.entries(this.data.chapters)) {
      if (chapter.index === chapterIndex) {
        return path;
      }
    }
    return null;
  }

  // --- 解析章节引用的辅助方法 ---
  private async resolveChapterReference(chapterRef: string): Promise<string | null> {
    // 处理直接是数字的情况，如 "51"
    if (/^\d+$/.test(chapterRef)) {
      const index = parseInt(chapterRef, 10);
      return await this.getChapterPathByIndex(index);
    } 
    // 处理 "cXX" 格式的情况，如 "c51"
    else if (/^c\d+$/.test(chapterRef)) {
      const index = parseInt(chapterRef.substring(1), 10);
      return await this.getChapterPathByIndex(index);
    }
    // 如果是完整路径，检查是否存在
    else if (this.getNodeTypeFromPath(chapterRef) === 'chapter') {
      if (this.data.chapters[chapterRef]) {
        return chapterRef;
      }
    }
    return null;
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
};

// 记录模块完成加载
log('OUTLINE-MANAGER','Module initialization complete (  Implementation)');

export default outlineTools;