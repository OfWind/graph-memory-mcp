import { promises as fs } from 'fs';
import { PATHS } from './storage-manager.js';

// 实体接口定义
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  aliases?: string[];
}

// 关系接口定义
export interface Relation {
  from: string;
  to: string;
  relationType: string;
  properties: string[];
}

// 知识图谱接口定义
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// 知识图谱管理器类，包含所有与知识图谱交互的操作  The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(PATHS.GRAPH_MEMORY_FILE, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") {
          // 确保所有实体都有aliases字段
          if (!item.aliases) {
            item.aliases = [];
          }
          graph.entities.push(item as Entity);
        }
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
    await fs.writeFile(PATHS.GRAPH_MEMORY_FILE, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));

    // 确保每个实体的aliases字段存在
    newEntities.forEach(entity => {
      if (!entity.aliases) {
        entity.aliases = [];
      }
    });
    
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

  // 基础搜索功能
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // 过滤实体
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      (e.aliases && e.aliases.some(alias => alias.toLowerCase().includes(query.toLowerCase()))) || // 添加别名搜索
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // 创建过滤后的实体名称集合，用于快速查找
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // 过滤关系，只包含过滤后实体之间的关系
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
    
    // 过滤实体
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // 创建过滤后的实体名称集合，用于快速查找
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // 过滤关系，只包含过滤后实体之间的关系
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
    
    // 1. 查找指定的实体（先通过名称查找，再通过别名查找）
    let targetEntity = graph.entities.find(e => e.name === entityName);
    
    // 如果没找到，尝试通过别名查找
    if (!targetEntity) {
      targetEntity = graph.entities.find(e => 
        e.aliases && e.aliases.includes(entityName)
      );
    }
    
    if (!targetEntity) {
      return { entities: [], relations: [] };
    }
    
    const actualEntityName = targetEntity.name; // 获取实体的真实名称
    
    // 2. 找出所有与该实体相关的关系（包括from和to两个方向）
    const relatedRelations = graph.relations.filter(r => 
      r.from === actualEntityName || r.to === actualEntityName
    );
    
    // 3. 收集所有与这些关系相关的其他实体名称
    const relatedEntityNames = new Set<string>();
    relatedEntityNames.add(actualEntityName); // 添加目标实体本身
    
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

  async updateEntityAliases(updates: { entityName: string; aliases: string[]; append?: boolean }[]): Promise<{ entityName: string; updatedAliases: string[] }[]> {
    const graph = await this.loadGraph();
    const results = updates.map(update => {
      const entity = graph.entities.find(e => e.name === update.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${update.entityName} not found`);
      }
      
      // 如果是追加模式，合并现有别名和新别名，并去重
      if (update.append && entity.aliases) {
        entity.aliases = Array.from(new Set([...entity.aliases, ...update.aliases]));
      } else {
        // 否则直接替换
        entity.aliases = [...update.aliases];
      }
      
      return { entityName: update.entityName, updatedAliases: entity.aliases };
    });
    
    await this.saveGraph(graph);
    return results;
  }
}

// 创建并导出知识图谱管理器的单例实例
export const knowledgeGraphManager = new KnowledgeGraphManager();

export default knowledgeGraphManager;