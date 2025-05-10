import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

// 使用当前工作目录作为基础路径，而不是模块路径
const CWD = process.cwd();

// 定义存储目录位置（默认为当前工作目录下的memory-storage目录）
const DEFAULT_STORAGE_DIR = path.join(CWD, 'memory-storage');
const STORAGE_DIR = process.env.MEMORY_STORAGE_DIR || DEFAULT_STORAGE_DIR;

// 定义各个文件路径
export const PATHS = {
  // 知识图谱文件
  GRAPH_MEMORY_FILE: path.join(STORAGE_DIR, 'graph-memory.json'),
  
  // 大纲文件
  OUTLINE_JSON_FILE: path.join(STORAGE_DIR, 'outline.json'),
  
  // 章节总结文件
  CHAPTER_SUMMARY_FILE: path.join(STORAGE_DIR, 'chapter-summaries.json'),
  
  // 场景描述文件
  SCENE_DESCRIPTION_FILE: path.join(STORAGE_DIR, 'scene-descriptions.json'),
  
  // 日志文件
  OUTLINE_LOG_FILE: path.join(STORAGE_DIR, 'mcp-graph-tools.log')
};

/**
 * 确保存储目录和文件存在
 */
export async function ensureStorageExists(): Promise<void> {
  try {
    // 创建存储目录（如果不存在）
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    
    console.error(`Storage directory ensured at: ${STORAGE_DIR}`);
    
    // 检查并创建各个文件（如果不存在）
    await ensureFileExists(PATHS.GRAPH_MEMORY_FILE, '');
    await ensureFileExists(PATHS.OUTLINE_JSON_FILE, '{"volumes":{},"acts":{},"plotPoints":{},"chapters":{}}');
    await ensureFileExists(PATHS.CHAPTER_SUMMARY_FILE, '{"summaries":{},"lastUpdated":"' + new Date().toISOString() + '"}');
    await ensureFileExists(PATHS.SCENE_DESCRIPTION_FILE, '{"descriptions":{"battle":[],"dialogue":[],"environment":[]},"lastUpdated":"' + new Date().toISOString() + '"}');
    
    console.error('All storage files are ready');
  } catch (error) {
    console.error('Error ensuring storage exists:', error);
    throw error;
  }
}

/**
 * 检查文件是否存在，如果不存在则创建带有默认内容的文件
 */
async function ensureFileExists(filePath: string, defaultContent: string): Promise<void> {
  try {
    await fs.access(filePath);
    console.error(`File exists: ${filePath}`);
  } catch (error) {
    console.error(`Creating file: ${filePath}`);
    await fs.writeFile(filePath, defaultContent);
  }
}

export default { PATHS, ensureStorageExists };