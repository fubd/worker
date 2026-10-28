import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

import { api } from '../api/client';
import type { Todo, TodoStatusFilter } from '@/shared/types';

const FILTER_OPTIONS: { label: string; value: TodoStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '已完成', value: 'completed' },
];

export default function TodosPage() {
  const { message } = App.useApp();

  const [items, setItems] = useState<Todo[]>([]);
  const [status, setStatus] = useState<TodoStatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // 输入防抖
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listTodos({ status, keyword });
      setItems(data.items);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const title = draft.trim();
    if (!title) {
      message.warning('先写点什么吧');
      return;
    }

    setCreating(true);
    try {
      await api.createTodo(title);
      setDraft('');
      await load();
      message.success('已添加');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (todo: Todo, completed: boolean) => {
    setBusyId(todo.id);
    try {
      await api.updateTodo(todo.id, { completed });
      setItems((prev) => prev.map((item) => (item.id === todo.id ? { ...item, completed } : item)));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async (todo: Todo, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title || title === todo.title) return;

    try {
      const updated = await api.updateTodo(todo.id, { title });
      setItems((prev) => prev.map((item) => (item.id === todo.id ? updated : item)));
      message.success('已重命名');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重命名失败');
    }
  };

  const handleDelete = async (todo: Todo) => {
    setBusyId(todo.id);
    try {
      await api.deleteTodo(todo.id);
      setItems((prev) => prev.filter((item) => item.id !== todo.id));
      message.success('已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusyId(null);
    }
  };

  const handleClearCompleted = async () => {
    try {
      const { removed } = await api.clearCompleted();
      await load();
      message.success(removed > 0 ? `已清理 ${removed} 条` : '没有已完成的任务');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '清理失败');
    }
  };

  const summary = useMemo(() => {
    const done = items.filter((item) => item.completed).length;
    return { total: items.length, done };
  }, [items]);

  return (
    <>
      <Card
        variant="borderless"
        className="swan-card"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 20 } }}
      >
        <Flex gap={10} wrap>
          <Input
            size="large"
            value={draft}
            maxLength={200}
            placeholder="要做什么？回车即可添加"
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={handleCreate}
            style={{ flex: '1 1 260px' }}
          />
          <Button
            size="large"
            type="primary"
            icon={<PlusOutlined />}
            loading={creating}
            onClick={handleCreate}
          >
            添加
          </Button>
        </Flex>

        <Flex gap={10} wrap align="center" style={{ marginTop: 16 }}>
          <Segmented
            options={FILTER_OPTIONS}
            value={status}
            onChange={(value) => setStatus(value as TodoStatusFilter)}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="搜索标题"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: '1 1 200px', maxWidth: 280 }}
          />
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            <Popconfirm
              title="清空所有已完成任务？"
              description="该操作会直接删除数据，不可恢复。"
              okText="清空"
              cancelText="取消"
              onConfirm={handleClearCompleted}
            >
              <Button danger icon={<ClearOutlined />}>
                清理已完成
              </Button>
            </Popconfirm>
          </Space>
        </Flex>
      </Card>

      <Card
        variant="borderless"
        className="swan-card"
        title={
          <Space size={8}>
            <span>任务列表</span>
            <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
              {summary.done}/{summary.total}
            </Tag>
          </Space>
        }
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            GET /api/todos
          </Typography.Text>
        }
        styles={{ body: { padding: '8px 20px 16px' } }}
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={keyword || status !== 'all' ? '没有匹配的任务' : '还没有任务，先加一条'}
            style={{ padding: '32px 0' }}
          />
        ) : (
          items.map((todo) => (
            <div key={todo.id} className="swan-todo-row">
              <Checkbox
                checked={todo.completed}
                disabled={busyId === todo.id}
                aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
                onChange={(event) => void handleToggle(todo, event.target.checked)}
              />

              <div className="swan-todo-title">
                <Typography.Text
                  className={todo.completed ? 'is-done' : undefined}
                  delete={todo.completed}
                  editable={{
                    tooltip: '双击/点击编辑标题',
                    maxLength: 200,
                    onChange: (value) => void handleRename(todo, value),
                  }}
                >
                  {todo.title}
                </Typography.Text>
              </div>

              <Typography.Text type="secondary" className="swan-mono" style={{ fontSize: 11 }}>
                #{todo.id}
              </Typography.Text>

              <div className="swan-todo-actions">
                <Popconfirm
                  title="删除这条任务？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(todo)}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={busyId === todo.id}
                  />
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
