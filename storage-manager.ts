import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取模块的目录路径
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// 定义存储目录位置（默认为模块同级的memory-storage目录）
const DEFAULT_STORAGE_DIR = path.join(MODULE_DIR, 'memory-storage');
const STORAGE_DIR = process.env.MEMORY_STORAGE_DIR || DEFAULT_STORAGE_DIR;

// 定义各个文件路径
export const PATHS = {
  // 知识图谱文件
  MEMORY_FILE: path.join(STORAGE_DIR, 'memory.json'),
  
  // 大纲文件
  OUTLINE_JSON_FILE: path.join(STORAGE_DIR, 'outline-v2.json'),
  OUTLINE_YAML_FILE: path.join(STORAGE_DIR, 'outline.yaml'),
  
  // 章节总结文件
  CHAPTER_SUMMARY_FILE: path.join(STORAGE_DIR, 'chapter-summaries.json'),
  
  // 日志文件
  OUTLINE_LOG_FILE: path.join(STORAGE_DIR, 'mcp-outline-tools-v2.log')
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
    await ensureFileExists(PATHS.MEMORY_FILE, '');
    await ensureFileExists(PATHS.OUTLINE_JSON_FILE, '{"volumes":{},"acts":{},"plotPoints":{},"chapters":{}}');
    await ensureFileExists(PATHS.CHAPTER_SUMMARY_FILE, '{"summaries":{},"lastUpdated":"' + new Date().toISOString() + '"}');
    
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