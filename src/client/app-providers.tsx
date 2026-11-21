import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        // Static rendering and the client's separate React root generate
        // different useId values. Pin the CSS-variable theme key so both
        // trees use the same Ant Design token class from the first frame.
        cssVar: { key: 'yuyan' },
        token: {
          colorPrimary: '#2f6fe8',
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
      {children}
    </ConfigProvider>
  );
}
