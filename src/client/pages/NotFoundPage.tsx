import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle="这个页面不存在，或者已经被移动到别处了。"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          回到概览
        </Button>
      }
      style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(15,23,42,0.08)' }}
    />
  );
}
