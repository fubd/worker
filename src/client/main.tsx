import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router/dom';

import 'antd/dist/reset.css';
import './styles/global.css';

import { router } from './router';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 #root 挂载节点');
}

const todosPage = location.pathname === '/todos' ? import('./pages/TodosPage') : Promise.resolve();

// 保留首帧静态 shell，直到 /todos 路由块可渲染；React 挂载前再清空预置内容。
void todosPage
  .catch(() => undefined)
  .finally(() => {
    container.replaceChildren();
    createRoot(container).render(
      <StrictMode>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              colorPrimary: '#1677ff',
              borderRadius: 10,
              fontFamily:
                "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
            },
            components: {
              Layout: {
                headerBg: 'transparent',
                bodyBg: 'transparent',
                siderBg: '#ffffff',
              },
              Menu: {
                itemBorderRadius: 8,
              },
            },
          }}
        >
          <RouterProvider router={router} />
        </ConfigProvider>
      </StrictMode>,
    );
  });
