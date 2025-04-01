#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { outlineTools } from './outline-tools.js';

console.error("MEMORY_FILE_PATH env:", process.env.MEMORY_FILE_PATH);

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH || defaultMemoryPath;

// Log the final path being used
console.error("Using memory file path:", MEMORY_FILE_PATH);

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
  properties: string[];
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") graph.entities.push(item as Entity);
        if (item.type === "relation") graph.relations.push(item as Relation);
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
    ];
    await fs.writeFile(MEMORY_FILE_PATH, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => {
      if (!r.properties) {
        r.properties = [];
      }
      
      return !graph.relations.some(existingRelation => 
        existingRelation.from === r.from && 
        existingRelation.to === r.to && 
        existingRelation.relationType === r.relationType
      );
    });
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async getEntityNetwork(entityName: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // 1. 查找指定的实体
    const targetEntity = graph.entities.find(e => e.name === entityName);
    if (!targetEntity) {
      return { entities: [], relations: [] };
    }
    
    // 2. 找出所有与该实体相关的关系（包括from和to两个方向）
    const relatedRelations = graph.relations.filter(r => 
      r.from === entityName || r.to === entityName
    );
    
    // 3. 收集所有与这些关系相关的其他实体名称
    const relatedEntityNames = new Set<string>();
    relatedEntityNames.add(entityName); // 添加目标实体本身
    
    relatedRelations.forEach(r => {
      relatedEntityNames.add(r.from);
      relatedEntityNames.add(r.to);
    });
    
    // 4. 获取所有相关实体的详细信息
    const relatedEntities = graph.entities.filter(e => 
      relatedEntityNames.has(e.name)
    );
    
    // 5. 返回包含目标实体网络的子图
    return {
      entities: relatedEntities,
      relations: relatedRelations
    };
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();


// The server instance and tools exposed to Claude
const server = new Server({
  name: "memory-server",
  version: "1.0.0",
},    {
    capabilities: {
      tools: {},
    },
  },);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "创建新实体到知识图谱中。每个实体的observations必须包含完整详细的信息，每项信息应单独成为数组中的一个元素，格式为'属性: 详细描述'",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "实体的名称" },
                  entityType: { type: "string", description: "实体的类型，如'人物'、'物品'、'组织'、'世界观'、'力量体系'、'事件'等" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "与实体相关的完整观察内容数组，应包含完整的信息，如类型为'人物'时，年龄: XX岁'、'性别: 男/女'、'身份: ...'、'记忆点: ...'、'定位: ...'、'人物冲突: ...'、'外貌特征: ...'、'背景故事: ...'、'性格特点: ...'、'能力: ...'、'弱点: ...'、'人际关系: ...'、'人物成长: ...'、'特殊设定: ...'等"
                  },
                },
                required: ["name", "entityType", "observations"],
              },
              description: "要创建的实体对象，每个实体都应有详尽的observations"
            },
          },
          required: ["entities"],
        },
      },
      {
        name: "create_relations",
        description: "在知识图谱中创建多个新关系。关系应该使用主动语态，每个关系必须包含详细的properties信息，描述关系的各个方面，每项信息应单独成为数组中的一个元素，格式为'属性: 详细描述'",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "关系起始实体的名称" },
                  to: { type: "string", description: "关系指向实体的名称" },
                  relationType: { type: "string", description: "关系的类型，如'雇佣'、'朋友'、'敌人'等" },
                  properties: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "关系的详细属性数组，包含关系的各方面信息，比如人物中可能会存在'关系起始时间: ...'、'关系地点: ...'、'亲密度: ...'、'互相称呼: ...'等"
                  },
                },
                required: ["from", "to", "relationType", "properties"],
              },
              description: "要创建的关系对象，每个关系都应有详尽的properties"
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents to add, format as 'XX章节更新内容: 详细内容'"
                  },
                },
                required: ["entityName", "contents"],
              },
              description: "添加新的观察内容到现有实体中。新添加的观察内容应单独成为数组中的一个元素，格式为'XX章节更新内容: 详细内容'",
            },
          },
          required: ["observations"],
        },
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: { 
              type: "array", 
              items: { type: "string" },
              description: "An array of entity names to delete" 
            },
          },
          required: ["entityNames"],
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  },
                },
                required: ["entityName", "observations"],
              },
            },
          },
          required: ["deletions"],
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
              description: "An array of relations to delete" 
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
          },
          required: ["query"],
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
        },
      },
      {
        name: "get_entity_network",
        description: "获取指定实体的完整网络，包括该实体本身以及所有与其直接相关的实体和关系",
        inputSchema: {
          type: "object",
          properties: {
            entityName: { 
              type: "string", 
              description: "要检索网络的实体名称" 
            },
          },
          required: ["entityName"],
        },
      },
      {
        name: "get_volume_info",
        description: "获取指定卷的基本信息，包括卷标题、章节数目、核心矛盾等，但不包含详细章节内容",
        inputSchema: {
          type: "object",
          properties: {
            volumeIndex: { 
              type: "number", 
              description: "卷的索引，从0开始" 
            },
          },
          required: ["volumeIndex"],
        },
      },
      {
        name: "get_chapter_outline_window",
        description: "获取指定章节及其前后N章的大纲信息（非章节全文），形成一个滑动窗口，便于规划和了解上下文。返回的是章节的剧情说明、情绪点、章末悬念、剧情点等计划内容，不包含章节的具体文字。",
        inputSchema: {
          type: "object",
          properties: {
            centerChapterIndex: { 
              type: "number", 
              description: "中心章节的索引，通常是当前正在计划撰写的章节" 
            },
            windowSize: { 
              type: "number", 
              description: "窗口大小，指定要获取中心章节前后各多少章的大纲信息，默认为2" 
            },
          },
          required: ["centerChapterIndex"],
        },
      },
      {
        name: "get_chapter_outline_by_index",
        description: "获取特定索引章节的大纲信息（非章节全文），包括剧情概要、情绪点、悬念等计划内容，不包含章节的具体文字。",
        inputSchema: {
          type: "object",
          properties: {
            chapterIndex: { 
              type: "number", 
              description: "章节的索引" 
            },
          },
          required: ["chapterIndex"],
        },
      },
      {
        name: "update_outline",
        description: "更新大纲的特定部分，可以更新卷、幕、情节点或章节的信息",
        inputSchema: {
          type: "object",
          properties: {
            volumeIndex: { 
              type: "number", 
              description: "要更新的卷的索引" 
            },
            actIndex: { 
              type: "number", 
              description: "要更新的幕的索引（可选）" 
            },
            plotPointIndex: { 
              type: "number", 
              description: "要更新的情节点的索引（可选）" 
            },
            chapterIndex: { 
              type: "number", 
              description: "要更新的章节的索引（可选）" 
            },
            newData: { 
              type: "object", 
              description: "新的数据内容" 
            },
          },
          required: ["volumeIndex", "newData"],
        },
      },
      {
        name: "add_outline",
        description: "添加或创建大纲内容，严格按照大纲层次结构：outline(顶层) > volume(卷) > acts(幕) > plot_points(情节点) > chapters(章节)。添加时必须遵循层次关系，例如添加act前必须先有volume，添加plot_point前必须先有act。参数中volumeIndex指定在哪个卷操作，actIndex指定在哪个幕操作，plotPointIndex指定在哪个情节点操作。",
        inputSchema: {
          type: "object",
          properties: {
            volumeIndex: { 
              type: "number", 
              description: "卷的索引位置。添加新卷时，使用现有卷数量作为索引可在末尾添加；使用0可在开头添加"
            },
            newData: { 
              type: "object", 
              description: "要添加的新内容。添加volume时需包含volume字段；添加act时需包含act_name字段；添加plot_point时需包含plot_point_name字段；添加chapter时需包含chapter_name和chapter_index字段" 
            },
            actIndex: { 
              type: "number", 
              description: "要添加到哪个幕中。不提供此参数表示添加卷；提供此参数表示在指定卷中添加幕或操作幕"
            },
            plotPointIndex: { 
              type: "number", 
              description: "要添加到哪个情节点中。不提供此参数表示添加幕；提供此参数表示在指定幕中添加情节点" 
            }
          },
          required: ["volumeIndex", "newData"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities as Entity[]), null, 2) }] };
    case "create_relations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations as Relation[]), null, 2) }] };
    case "add_observations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations as { entityName: string; contents: string[] }[]), null, 2) }] };
    case "delete_entities":
      await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await knowledgeGraphManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "read_graph":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
    case "get_entity_network":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.getEntityNetwork(args.entityName as string), null, 2) }] };
    case "get_volume_info":
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(await outlineTools.getVolumeInfo(Number(args.volumeIndex)), null, 2) 
        }] 
      };
    case "get_chapter_outline_window":
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(await outlineTools.getChapterOutlineWindow(Number(args.centerChapterIndex), Number(args.windowSize)), null, 2) 
        }] 
      };
    case "get_chapter_outline_by_index":
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(await outlineTools.getChapterOutlineByIndex(Number(args.chapterIndex)), null, 2) 
        }] 
      };
    case "update_outline":
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(await outlineTools.updateOutline(
            Number(args.volumeIndex),
            args.newData,
            Number(args.actIndex), 
            Number(args.plotPointIndex), 
            Number(args.chapterIndex)
          ), null, 2) 
        }] 
      };
    case "add_outline":
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify(await outlineTools.addOutline(
            args.newData,
            args.volumeIndex !== undefined ? Number(args.volumeIndex) : undefined,
            args.actIndex !== undefined ? Number(args.actIndex) : undefined, 
            args.plotPointIndex !== undefined ? Number(args.plotPointIndex) : undefined
          ), null, 2) 
        }] 
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  // Ensure the directory exists
  const memoryDir = path.dirname(MEMORY_FILE_PATH);
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    
    // Check if file exists, if not create an empty one
    try {
      await fs.access(MEMORY_FILE_PATH);
    } catch (error) {
      // File doesn't exist, create an empty knowledge graph file
      console.error(`Memory file not found, creating empty one at: ${MEMORY_FILE_PATH}`);
      await fs.writeFile(MEMORY_FILE_PATH, '');
    }
  } catch (error) {
    console.error("Error ensuring memory file exists:", error);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});