/**
 * Worker 运行环境绑定（与 wrangler.jsonc 中一一对应）
 */
export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** 静态资源绑定（rsbuild 构建产物 ./dist） */
  ASSETS: Fetcher;
  /** 环境标识，可在 wrangler.jsonc 的 vars 里覆盖 */
  ENVIRONMENT?: string;
}

export type AppEnv = {
  Bindings: Env;
};

/** 数据库原始行（completed 用 0/1 存储） */
export interface TodoRow {
  id: number;
  title: string;
  completed: number;
  created_at: string;
  updated_at: string;
}

export type { Todo, TodoStats, TodoStatusFilter } from '../shared/types';
