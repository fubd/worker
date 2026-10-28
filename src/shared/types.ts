/** 前后端共享的类型定义 */

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoListResponse {
  items: Todo[];
  total: number;
}

export interface TodoStats {
  total: number;
  completed: number;
  active: number;
  completionRate: number;
  database: string;
  region: string;
  runtime: string;
}

export type TodoStatusFilter = 'all' | 'active' | 'completed';
