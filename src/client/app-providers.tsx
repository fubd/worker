import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import { AuthProvider } from './auth/AuthProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        // Keep Ant Design's generated CSS-variable class stable between the
        // static render and hydration.
        cssVar: { key: 'yuyan' },
        token: {
          colorPrimary: '#2f6fe8',
          colorText: '#17243a',
          colorTextSecondary: '#718197',
          colorBorderSecondary: 'rgba(37, 67, 105, 0.1)',
          colorBgContainer: '#ffffff',
          borderRadius: 12,
          controlHeight: 36,
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
      <AuthProvider>{children}</AuthProvider>
    </ConfigProvider>
  );
}
