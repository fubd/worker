import { Button, Result, Typography } from 'antd';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

/**
 * 路由级错误边界：页面渲染/加载抛错时兜底，避免白屏。
 */
export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  const isResponse = isRouteErrorResponse(error);
  const status = isResponse ? error.status : 500;
  const title = isResponse ? `${error.status} ${error.statusText}` : '页面出错了';
  const detail = isResponse
    ? error.data
    : error instanceof Error
      ? error.message
      : '未知错误';

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Result
          status={status === 404 ? '404' : 'error'}
          title={title}
          subTitle="刷新页面可以重试；如果一直出现，请查看 Worker 日志。"
          extra={[
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>
              刷新
            </Button>,
            <Button key="home" onClick={() => navigate('/')}>
              回到概览
            </Button>,
          ]}
        />
        <Typography.Paragraph
          type="secondary"
          className="swan-mono"
          style={{ textAlign: 'center', marginTop: -8, wordBreak: 'break-word' }}
        >
          {String(detail)}
        </Typography.Paragraph>
      </div>
    </div>
  );
}
