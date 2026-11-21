import { useEffect, useMemo, useRef, useState } from 'react';
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
  Space,
  Spin,
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
import {
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { api } from '../api/client';
import type { Todo, TodoListResponse, TodoListSnapshot, TodoStatusFilter } from '@/shared/types';

const FILTER_OPTIONS: { label: string; value: TodoStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '已完成', value: 'completed' },
];

type TodoActionIntent = 'create' | 'toggle' | 'rename' | 'delete' | 'clear-completed' | 'unknown';

type TodoActionResult = {
  intent: TodoActionIntent;
  ok: boolean;
  error?: string;
  removed?: number;
};

type TodosLoaderData = TodoListResponse & {
  fromSnapshot: boolean;
};

let hasLoadedTodos = false;

function parseStatus(value: string | null): TodoStatusFilter {
  return value === 'active' || value === 'completed' ? value : 'all';
}

function parseIntent(value: FormDataEntryValue | null): TodoActionIntent {
  return value === 'create' ||
    value === 'toggle' ||
    value === 'rename' ||
    value === 'delete' ||
    value === 'clear-completed'
    ? value
    : 'unknown';
}

function parseId(value: FormDataEntryValue | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<TodosLoaderData> {
  const url = new URL(request.url);
  const status = parseStatus(url.searchParams.get('status'));
  const keyword = url.searchParams.get('q')?.trim() ?? '';

  if (!hasLoadedTodos) {
    hasLoadedTodos = true;
    const snapshot = api.initialTodos();
    if (status === 'all' && !keyword && snapshot) {
      return { items: snapshot.items, fromSnapshot: true };
    }
  }

  const data = await api.listTodos({ status, keyword }, { signal: request.signal });
  return { ...data, fromSnapshot: false };
}

export async function action({ request }: ActionFunctionArgs): Promise<TodoActionResult> {
  const form = await request.formData();
  const intent = parseIntent(form.get('intent'));

  try {
    switch (intent) {
      case 'create': {
        const title = String(form.get('title') ?? '').trim();
        await api.createTodo(title);
        return { intent, ok: true };
      }

      case 'toggle': {
        const id = parseId(form.get('id'));
        if (!id) return { intent, ok: false, error: 'id 非法' };
        await api.updateTodo(id, { completed: form.get('completed') === 'true' });
        return { intent, ok: true };
      }

      case 'rename': {
        const id = parseId(form.get('id'));
        const title = String(form.get('title') ?? '').trim();
        if (!id) return { intent, ok: false, error: 'id 非法' };
        if (!title) return { intent, ok: false, error: '标题不能为空' };
        await api.updateTodo(id, { title });
        return { intent, ok: true };
      }

      case 'delete': {
        const id = parseId(form.get('id'));
        if (!id) return { intent, ok: false, error: 'id 非法' };
        await api.deleteTodo(id);
        return { intent, ok: true };
      }

      case 'clear-completed': {
        const { removed } = await api.clearCompleted();
        return { intent, ok: true, removed };
      }

      default:
        return { intent, ok: false, error: '未知操作' };
    }
  } catch (error) {
    return {
      intent,
      ok: false,
      error: errorMessage(error, '操作失败'),
    };
  }
}

function TodosSnapshot({ snapshot }: { snapshot: TodoListSnapshot }) {
  const completed = snapshot.items.filter((todo) => todo.completed).length;

  return (
    <section className="swan-card swan-todos-preview" aria-label="待办快照">
      <div className="swan-todos-preview-head">
        <span>任务列表</span>
        <span className="swan-todos-preview-count">
          {completed}/{snapshot.items.length}
        </span>
      </div>
      <div className="swan-todos-preview-list">
        {snapshot.items.map((todo) => (
          <div className="swan-todos-preview-row" key={todo.id}>
            <span
              className={
                todo.completed ? 'swan-todos-preview-check is-done' : 'swan-todos-preview-check'
              }
            />
            <span
              className={
                todo.completed ? 'swan-todos-preview-title is-done' : 'swan-todos-preview-title'
              }
            >
              {todo.title}
            </span>
            <span className="swan-todos-preview-id">#{todo.id}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TodosControlsFallback() {
  return (
    <section className="swan-card swan-todos-controls" aria-hidden="true">
      <div className="swan-todos-controls-row">
        <div className="swan-boot-input is-grow">要做什么？回车即可添加</div>
        <span className="swan-boot-button is-large is-primary">
          <PlusOutlined />
          添加
        </span>
      </div>
      <div className="swan-todos-controls-row">
        <div className="swan-boot-segmented">
          <span className="swan-boot-segment is-selected">全部</span>
          <span className="swan-boot-segment">进行中</span>
          <span className="swan-boot-segment">已完成</span>
        </div>
        <div className="swan-boot-input is-search">
          <SearchOutlined />
          <span style={{ marginLeft: 8 }}>搜索标题</span>
        </div>
        <span className="swan-boot-button">
          <ReloadOutlined />
          刷新
        </span>
        <span className="swan-boot-button is-danger">
          <ClearOutlined />
          清理已完成
        </span>
      </div>
    </section>
  );
}

export function HydrateFallback() {
  const snapshot = api.initialTodos();
  return (
    <>
      <TodosControlsFallback />
      {snapshot && <TodosSnapshot snapshot={snapshot} />}
    </>
  );
}

/**
 * App 只给当前页提供 message/modal 上下文。放在懒加载的 TodosPage 里而不是
 * main.tsx 的根节点，首屏就不会下载 antd 的 App/message/modal 代码。
 */
export default function TodosPage() {
  return (
    <App>
      <TodosPageContent />
    </App>
  );
}

function TodosPageContent() {
  const { message } = App.useApp();
  const data = useLoaderData<TodosLoaderData>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const createFetcher = useFetcher<TodoActionResult>();
  const clearFetcher = useFetcher<TodoActionResult>();
  const refreshedSnapshot = useRef(false);
  const submittedTitle = useRef('');
  const handledCreateResult = useRef<TodoActionResult | null>(null);
  const handledClearResult = useRef<TodoActionResult | null>(null);

  const status = parseStatus(searchParams.get('status'));
  const keyword = searchParams.get('q')?.trim() ?? '';
  const [search, setSearch] = useState(keyword);
  const [draft, setDraft] = useState('');

  useEffect(() => setSearch(keyword), [keyword]);

  useEffect(() => {
    const nextKeyword = search.trim();
    if (nextKeyword === keyword) return;

    const timer = setTimeout(() => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextKeyword) next.set('q', nextKeyword);
          else next.delete('q');
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, search, setSearchParams]);

  useEffect(() => {
    if (!data.fromSnapshot || refreshedSnapshot.current) return;
    refreshedSnapshot.current = true;

    const refresh = () => {
      if (revalidator.state === 'idle') void revalidator.revalidate();
    };
    const idleId = window.requestIdleCallback?.(refresh, { timeout: 1_000 });
    const timer = idleId === undefined ? setTimeout(refresh, 0) : undefined;

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [data.fromSnapshot, revalidator]);

  useEffect(() => {
    const result = createFetcher.data;
    if (createFetcher.state !== 'idle' || !result || result === handledCreateResult.current) return;
    handledCreateResult.current = result;

    if (!result.ok) {
      message.error(result.error ?? '创建失败');
      return;
    }

    setDraft((current) => (current === submittedTitle.current ? '' : current));
    message.success('已添加');
  }, [createFetcher.data, createFetcher.state, message]);

  useEffect(() => {
    const result = clearFetcher.data;
    if (clearFetcher.state !== 'idle' || !result || result === handledClearResult.current) return;
    handledClearResult.current = result;

    if (!result.ok) {
      message.error(result.error ?? '清理失败');
      return;
    }

    message.success(result.removed ? `已清理 ${result.removed} 条` : '没有已完成的任务');
  }, [clearFetcher.data, clearFetcher.state, message]);

  const updateStatus = (nextStatus: TodoStatusFilter) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextStatus === 'all') next.delete('status');
        else next.set('status', nextStatus);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const handleCreate = () => {
    const title = draft.trim();
    if (!title) {
      message.warning('先写点什么吧');
      return;
    }

    submittedTitle.current = title;
    createFetcher.submit({ intent: 'create', title }, { method: 'post' });
  };

  const handleClearCompleted = () => {
    clearFetcher.submit({ intent: 'clear-completed' }, { method: 'post' });
  };

  const summary = useMemo(() => {
    const done = data.items.filter((item) => item.completed).length;
    return { total: data.items.length, done };
  }, [data.items]);

  const loading = navigation.state === 'loading' || revalidator.state === 'loading';
  const creating = createFetcher.state !== 'idle';
  const clearing = clearFetcher.state !== 'idle';

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
            onChange={(value) => updateStatus(value as TodoStatusFilter)}
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
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void revalidator.revalidate()}
            >
              刷新
            </Button>
            <Popconfirm
              title="清空所有已完成任务？"
              description="该操作会直接删除数据，不可恢复。"
              okText="清空"
              cancelText="取消"
              onConfirm={handleClearCompleted}
            >
              <Button danger icon={<ClearOutlined />} loading={clearing}>
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
        {data.items.length === 0 && loading ? (
          <Flex justify="center" style={{ padding: '32px 0' }}>
            <Spin size="small" />
          </Flex>
        ) : data.items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={keyword || status !== 'all' ? '没有匹配的任务' : '还没有任务，先加一条'}
            style={{ padding: '32px 0' }}
          />
        ) : (
          data.items.map((todo) => <TodoRow key={todo.id} todo={todo} />)
        )}
      </Card>
    </>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const { message } = App.useApp();
  const fetcher = useFetcher<TodoActionResult>();
  const handledResult = useRef<TodoActionResult | null>(null);

  useEffect(() => {
    const result = fetcher.data;
    if (fetcher.state !== 'idle' || !result || result === handledResult.current) return;
    handledResult.current = result;

    if (!result.ok) {
      message.error(result.error ?? '操作失败');
      return;
    }

    if (result.intent === 'rename') message.success('已重命名');
    if (result.intent === 'delete') message.success('已删除');
  }, [fetcher.data, fetcher.state, message]);

  const busy = fetcher.state !== 'idle';

  const handleRename = (nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title || title === todo.title) return;
    fetcher.submit({ intent: 'rename', id: String(todo.id), title }, { method: 'post' });
  };

  return (
    <div className="swan-todo-row">
      <Checkbox
        checked={todo.completed}
        disabled={busy}
        aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
        onChange={(event) =>
          fetcher.submit(
            {
              intent: 'toggle',
              id: String(todo.id),
              completed: String(event.target.checked),
            },
            { method: 'post' },
          )
        }
      />

      <div className="swan-todo-title">
        <Typography.Text
          className={todo.completed ? 'is-done' : undefined}
          delete={todo.completed}
          editable={{
            tooltip: '双击/点击编辑标题',
            maxLength: 200,
            onChange: handleRename,
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
          onConfirm={() =>
            fetcher.submit({ intent: 'delete', id: String(todo.id) }, { method: 'post' })
          }
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={busy} />
        </Popconfirm>
      </div>
    </div>
  );
}
