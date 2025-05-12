import { promises as fs } from 'fs';
import path from 'path';
import { PATHS } from './storage-manager.js';

// 日志目录
const LOG_DIR = path.dirname(PATHS.LOG_FILE);

/**
 * 获取当前日期格式化字符串，用于日志文件名
 * @returns 格式化的日期字符串，如 '2023-05-15'
 */
function getFormattedDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取当前日期的日志文件路径
 * @returns 日志文件的完整路径
 */
function getCurrentLogFilePath(): string {
  const dateStr = getFormattedDate();
  return path.join(LOG_DIR, `mcp-graph-${dateStr}.log`);
}

/**
 * 记录日志
 * @param source 日志来源模块名称
 * @param message 日志消息
 * @param data 可选的数据对象
 */
export async function log(source: string, message: string, data?: any): Promise<void> {
  const timestamp = new Date().toISOString();
  const logMessage = data
    ? `${timestamp} [${source}] ${message}: ${JSON.stringify(data, null, 2)}`
    : `${timestamp} [${source}] ${message}`;

  console.log(logMessage);

  try {
    // 确保日志目录存在
    await fs.mkdir(LOG_DIR, { recursive: true });
    
    // 使用当前日期的日志文件
    const logFilePath = getCurrentLogFilePath();
    await fs.appendFile(logFilePath, logMessage + '\n');
  } catch (err) {
    console.error('Error writing to log file:', err);
  }
}

export default { log };