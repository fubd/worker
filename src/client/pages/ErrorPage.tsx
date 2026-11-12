import { Button } from 'antd';
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
  const detail = isResponse ? error.data : error instanceof Error ? error.message : '未知错误';

  return (
    <div className="swan-error-page">
      <div className="swan-error-card">
        <div className="swan-error-code">{status}</div>
        <h1>{title}</h1>
        <p>刷新页面可以重试；如果一直出现，请查看 Worker 日志。</p>
        <div className="swan-error-actions">
          <Button type="primary" onClick={() => window.location.reload()}>
            刷新
          </Button>
          <Button onClick={() => navigate('/')}>回到概览</Button>
        </div>
        <pre className="swan-mono swan-error-detail">{String(detail)}</pre>
      </div>
    </div>
  );
}
