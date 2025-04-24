import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';

// 添加日志帮助函数
function log(message: string, data?: any) {
  const logMessage = data 
    ? `[OUTLINE-TOOLS] ${message}: ${JSON.stringify(data, null, 2)}`
    : `[OUTLINE-TOOLS] ${message}`;
    
  // 同时输出到控制台
  console.log(logMessage);
  
  // 写入文件
  fs.appendFile('mcp-outline-tools.log', logMessage + '\n')
    .catch(err => console.error('Error writing to log file:', err));
}

// 在模块开始时记录初始化
log('模块初始化开始');

// 定义环境变量或使用默认值
const OUTLINE_FILE_PATH = process.env.OUTLINE_FILE_PATH || 'outline.yaml';
log(`使用大纲文件路径: ${OUTLINE_FILE_PATH}`);

// 大纲结构接口定义
interface Chapter {
  chapter_name: string;
  chapter_index: number;
  剧情说明?: string;
  情绪点?: string;
  章末悬念?: string;
  剧情点?: string[];
  [key: string]: any; // 允许其他字段
}

interface PlotPoint {
  plot_point_name: string;
  章节数目?: string;
  具体章节?: string;
  剧情?: string;
  爽点设置?: string;
  chapters?: Chapter[];
  [key: string]: any; 
}

interface Act {
  act_name: string;
  章节数目?: number;
  简介?: string;
  plot_points?: PlotPoint[];
  [key: string]: any; 
}

interface Volume {
  volume: string;
  章节数目?: number;
  核心矛盾?: string;
  主要反派?: string;
  剧情结局?: string[];
  acts?: Act[];
  [key: string]: any; 
}

interface Outline {
  outline: Volume[];
}

async function readOutlineFile(): Promise<Outline> {
  log('开始读取大纲文件');
  try {
    log(`尝试读取文件: ${OUTLINE_FILE_PATH}`);
    const fileContent = await fs.readFile(OUTLINE_FILE_PATH, 'utf8');
    log('读取成功，正在解析YAML');
    const result = yaml.load(fileContent) as Outline;
    log('解析完成', { volumeCount: result.outline?.length });
    return result;
  } catch (error) {
    console.error(`Error reading outline file: ${error}`);
    
    // 如果文件不存在，创建一个空的outline文件
    if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
      log('文件不存在，创建空大纲');
      const emptyOutline: Outline = { outline: [] };
      
      try {
        // 确保目录存在
        const directory = path.dirname(OUTLINE_FILE_PATH);
        log(`创建目录: ${directory}`);
        await fs.mkdir(directory, { recursive: true });
        
        // 创建空文件
        const yamlContent = yaml.dump(emptyOutline);
        log(`写入空大纲到: ${OUTLINE_FILE_PATH}`);
        await fs.writeFile(OUTLINE_FILE_PATH, yamlContent, 'utf8');
        console.error(`Created empty outline file at: ${OUTLINE_FILE_PATH}`);
      } catch (writeError) {
        log(`创建文件失败: ${writeError}`);
        console.error(`Failed to create outline file: ${writeError}`);
      }
      
      return emptyOutline;
    }
    
    // 其他错误
    log(`读取文件时遇到未知错误: ${error}`);
    throw error;
  }
}

// 辅助函数：写入大纲文件
async function writeOutlineFile(outline: Outline): Promise<void> {
  try {
    const yamlContent = yaml.dump(outline, { 
      indent: 2, 
      lineWidth: -1, // 不限制行宽
      noRefs: true  // 避免引用标记
    });
    await fs.writeFile(OUTLINE_FILE_PATH, yamlContent, 'utf8');
  } catch (error) {
    console.error(`Error writing outline file: ${error}`);
    throw error;
  }
}

// 工具1: 获取卷的基本信息
export async function getVolumeInfo(volumeIndex: number): Promise<Volume | null> {
  const outline = await readOutlineFile();
  
  if (volumeIndex < 0 || volumeIndex >= outline.outline.length) {
    return null;
  }
  
  // 返回卷的基本信息，移除详细章节内容以减小体积
  const volume = { ...outline.outline[volumeIndex] };
  if (volume.acts) {
    volume.acts = volume.acts.map(act => {
      const { plot_points, ...actWithoutPlotPoints } = act;
      return actWithoutPlotPoints;
    });
  }
  
  return volume;
}

// 工具2: 获取指定章节及其前后N章的信息
export async function getChapterOutlineWindow(centerChapterIndex: number, windowSize: number = 2): Promise<Chapter[]> {
  log(`获取章节窗口 - 中心章节: ${centerChapterIndex}, 窗口大小: ${windowSize}`);
  const outline = await readOutlineFile();
  const allChapters: Chapter[] = [];
  
  // 收集所有章节
  outline.outline.forEach(volume => {
    volume.acts?.forEach(act => {
      act.plot_points?.forEach(plotPoint => {
        if (plotPoint.chapters) {
          allChapters.push(...plotPoint.chapters);
          log(`从情节点 "${plotPoint.plot_point_name}" 添加 ${plotPoint.chapters.length} 章`);
        }
      });
    });
  });
  
  // 根据chapter_index排序
  allChapters.sort((a, b) => a.chapter_index - b.chapter_index);
  log(`总共收集了 ${allChapters.length} 章, 排序后的章节索引: ${allChapters.map(ch => ch.chapter_index).join(', ')}`);
  
  // 查找中心章节的位置
  const centerIndex = allChapters.findIndex(ch => ch.chapter_index === centerChapterIndex);
  log(`中心章节在数组中的位置: ${centerIndex}`);
  if (centerIndex === -1) {
    log(`未找到中心章节 ${centerChapterIndex}`);
    return [];
  }
  
  // 计算窗口范围
  const startIndex = Math.max(0, centerIndex - windowSize);
  const endIndex = Math.min(allChapters.length - 1, centerIndex + windowSize);
  log(`窗口范围 - 开始索引: ${startIndex}, 结束索引: ${endIndex}`);
  
  // 返回窗口内的章节
  const result = allChapters.slice(startIndex, endIndex + 1);
  log(`返回章节窗口, 包含 ${result.length} 章`, result.map(ch => ({ 
    index: ch.chapter_index, 
    name: ch.chapter_name 
  })));
  return result;
}

// 工具3: 获取特定索引的章节信息
export async function getChapterOutlineByIndex(chapterIndex: number): Promise<Chapter | null> {
  const outline = await readOutlineFile();
  
  for (const volume of outline.outline) {
    for (const act of volume.acts || []) {
      for (const plotPoint of act.plot_points || []) {
        const chapter = (plotPoint.chapters || []).find(ch => ch.chapter_index === chapterIndex);
        if (chapter) {
          return chapter;
        }
      }
    }
  }
  
  return null;
}

// 工具4: 更新大纲的特定部分
export async function updateOutline(
  volumeIndex: number,
  newData: any,
  actIndex?: number,
  plotPointIndex?: number,
  chapterIndex?: number
): Promise<boolean> {
  const outline = await readOutlineFile();
  
  if (volumeIndex < 0 || volumeIndex >= outline.outline.length) {
    return false;
  }
  
  // 更新卷信息
  if (actIndex === undefined) {
    outline.outline[volumeIndex] = { ...outline.outline[volumeIndex], ...newData };
    await writeOutlineFile(outline);
    return true;
  }
  
  const acts = outline.outline[volumeIndex].acts || [];
  if (actIndex < 0 || actIndex >= acts.length) {
    return false;
  }
  
  // 更新幕信息
  if (plotPointIndex === undefined) {
    acts[actIndex] = { ...acts[actIndex], ...newData };
    await writeOutlineFile(outline);
    return true;
  }
  
  const plotPoints = acts[actIndex].plot_points || [];
  if (plotPointIndex < 0 || plotPointIndex >= plotPoints.length) {
    return false;
  }
  
  // 更新情节点信息
  if (chapterIndex === undefined) {
    plotPoints[plotPointIndex] = { ...plotPoints[plotPointIndex], ...newData };
    await writeOutlineFile(outline);
    return true;
  }
  
  const chapters = plotPoints[plotPointIndex].chapters || [];
  const chapterIdx = chapters.findIndex(ch => ch.chapter_index === chapterIndex);
  if (chapterIdx === -1) {
    return false;
  }
  
  // 更新章节信息
  chapters[chapterIdx] = { ...chapters[chapterIdx], ...newData };
  await writeOutlineFile(outline);
  return true;
}

/**
 * 增强版添加大纲函数 - 支持一次性创建完整层次结构或添加特定部分
 * @param newData 要添加的数据
 * @param volumeIndex 卷的索引
 * @param actIndex 幕的索引
 * @param plotPointIndex 情节点的索引
 * @returns 是否添加成功
 */
export async function addOutline(
  newData: any,
  volumeIndex?: number,
  actIndex?: number,
  plotPointIndex?: number
): Promise<boolean> {
  try {
    // 读取现有大纲
    let outline: any = { outline: [] };
    try {
      const fileContent = await fs.readFile(OUTLINE_FILE_PATH, 'utf-8');
      outline = yaml.load(fileContent) as any;
      if (!outline || !outline.outline) {
        outline = { outline: [] };
      }
    } catch (error) {
      console.log('No existing outline file, creating new one');
    }

    // 深度合并函数（使用类型安全的方式）
    function deepMerge(target: any, source: any): any {
      // 如果源是数组
      if (Array.isArray(source)) {
        if (!Array.isArray(target)) {
          target = [];
        }
        
        // 对于章节数组，我们需要特殊处理以避免覆盖
        if (source.length > 0 && source[0] && (source[0].chapter_name || source[0].chapter_index)) {
          // 这是章节数组，使用章节索引作为唯一标识符
          const targetMap = new Map();
          target.forEach((item: any) => {
            if (item.chapter_index) {
              targetMap.set(item.chapter_index, item);
            }
          });
          
          source.forEach((sourceChapter: any) => {
            if (sourceChapter.chapter_index) {
              if (targetMap.has(sourceChapter.chapter_index)) {
                // 更新现有章节
                const existingChapter = targetMap.get(sourceChapter.chapter_index);
                Object.assign(existingChapter, sourceChapter);
              } else {
                // 添加新章节
                target.push({...sourceChapter});
              }
            } else {
              // 没有章节索引的情况，直接添加
              target.push({...sourceChapter});
            }
          });
          
          return target;
        }
        
        // 合并其他类型的数组元素
        source.forEach((item, index) => {
          if (index >= target.length) {
            target.push(typeof item === 'object' && item !== null ? deepMerge({}, item) : item);
          } else {
            target[index] = typeof item === 'object' && item !== null ? 
              deepMerge(target[index] || {}, item) : item;
          }
        });
        
        return target;
      }
      
      // 如果源是对象
      if (typeof source === 'object' && source !== null) {
        if (typeof target !== 'object' || target === null || Array.isArray(target)) {
          target = {};
        }
        
        // 合并对象属性
        Object.keys(source).forEach(key => {
          const sourceValue = source[key];
          
          if (typeof sourceValue === 'object' && sourceValue !== null) {
            // 递归合并嵌套对象或数组
            target[key] = deepMerge(target[key] || (Array.isArray(sourceValue) ? [] : {}), sourceValue);
          } else {
            // 基本类型直接赋值
            target[key] = sourceValue;
          }
        });
        
        return target;
      }
      
      // 基本类型直接返回源
      return source;
    }

    // 处理一次性添加完整大纲的情况
    if (volumeIndex === undefined) {
      outline.outline.push(newData);
    } else if (volumeIndex >= 0) {
      // 确保卷索引存在
      while (outline.outline.length <= volumeIndex) {
        outline.outline.push({});
      }
      
      // 特殊处理添加act的情况
      if (actIndex === undefined && newData.act_name) {
        // 用户尝试添加act信息，确保acts数组存在
        if (!outline.outline[volumeIndex].acts) {
          outline.outline[volumeIndex].acts = [];
        }
        
        // 将act信息添加到acts数组中
        outline.outline[volumeIndex].acts.push(newData);
      } else if (actIndex === undefined) {
        // 在卷级别添加或合并数据
        outline.outline[volumeIndex] = deepMerge(outline.outline[volumeIndex], newData);
      } else if (actIndex >= 0) {
        // 确保acts数组存在
        if (!outline.outline[volumeIndex].acts) {
          outline.outline[volumeIndex].acts = [];
        }
        
        // 确保act索引存在
        while (outline.outline[volumeIndex].acts.length <= actIndex) {
          outline.outline[volumeIndex].acts.push({});
        }
        
        // 特殊处理添加plot_point的情况
        if (plotPointIndex === undefined && newData.plot_point_name) {
          // 用户尝试添加情节点信息，确保plot_points数组存在
          if (!outline.outline[volumeIndex].acts[actIndex].plot_points) {
            outline.outline[volumeIndex].acts[actIndex].plot_points = [];
          }
          
          // 将情节点信息添加到plot_points数组中
          outline.outline[volumeIndex].acts[actIndex].plot_points.push(newData);
        } else if (plotPointIndex === undefined) {
          // 在幕级别添加或合并数据
          outline.outline[volumeIndex].acts[actIndex] = deepMerge(
            outline.outline[volumeIndex].acts[actIndex], 
            newData
          );
        } else if (plotPointIndex >= 0) {
          // 确保plot_points数组存在
          if (!outline.outline[volumeIndex].acts[actIndex].plot_points) {
            outline.outline[volumeIndex].acts[actIndex].plot_points = [];
          }
          
          // 确保plotPoint索引存在
          while (outline.outline[volumeIndex].acts[actIndex].plot_points.length <= plotPointIndex) {
            outline.outline[volumeIndex].acts[actIndex].plot_points.push({});
          }
          
          // 在情节点级别添加或合并数据
          outline.outline[volumeIndex].acts[actIndex].plot_points[plotPointIndex] = deepMerge(
            outline.outline[volumeIndex].acts[actIndex].plot_points[plotPointIndex],
            newData
          );
        } else {
          return false; // 无效的plotPointIndex
        }
      } else {
        return false; // 无效的actIndex
      }
    } else {
      return false; // 无效的volumeIndex
    }

    // 写入文件
    await fs.writeFile(OUTLINE_FILE_PATH, yaml.dump(outline, { lineWidth: -1 }), 'utf-8');
    return true;
  } catch (error) {
    console.error('添加大纲时出错:', error);
    return false;
  }
}

// 导出所有工具函数
export const outlineTools = {
  getVolumeInfo,
  getChapterOutlineWindow,
  getChapterOutlineByIndex,
  updateOutline,
  addOutline
};

// 在文件末尾添加初始化日志
log('模块导出完成');

export default outlineTools;