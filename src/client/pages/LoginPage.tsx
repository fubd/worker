import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  GithubOutlined,
  GoogleOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { BRAND } from '@/shared/brand';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';

interface PasswordLoginValues {
  email: string;
  password: string;
}

const enableSpeedInsights = import.meta.env.PROD;

function authErrorMessage(value: string | null): string | null {
  if (value === 'denied') return '这个账号不在雨燕的允许名单中。';
  if (value === 'cancelled') return '登录已取消，你可以重新尝试。';
  if (value === 'unavailable') return '登录服务还没有配置完成，请稍后重试。';
  return null;
}

function LoginIllustration() {
  return (
    <div className="swan-login-art" aria-hidden="true">
      <div className="swan-login-sheet">
        <span>TODAY / PRIVATE</span>
        <strong>继续上次的那句话</strong>
        <i />
        <i />
        <i />
      </div>
      <svg viewBox="0 0 440 230" fill="none">
        <path
          d="M8 203C80 168 111 91 186 112C250 130 263 198 326 157C374 126 399 72 431 49"
          stroke="#8CB6EF"
          strokeWidth="1.5"
          strokeDasharray="5 9"
          strokeLinecap="round"
        />
        <path
          transform="translate(330 101) scale(.62)"
          d="M0 24C15 8 30 6 42 15C50 11 61 11 71 16C61 20 54 26 51 34C43 30 37 31 32 37L24 50L22 36C14 30 7 27 0 24Z"
          fill="#2F6FE8"
        />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const { status, signIn, signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const authNotice = authErrorMessage(searchParams.get('auth'));

  if (status === 'authenticated') return <Navigate to="/docs" replace />;

  const submitPassword = async (values: PasswordLoginValues) => {
    setSubmitting(true);
    setLoginError(null);
    try {
      await signInWithPassword(values.email, values.password);
      navigate('/docs', { replace: true });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="swan-login">
      <header className="swan-public-header">
        <a className="swan-public-brand" href="/" aria-label="返回雨燕首页">
          <BrandMark size={36} />
          <span>
            <strong>{BRAND.name}</strong>
            <small>{BRAND.tagline}</small>
          </span>
        </a>
        <a className="swan-login-back" href="/">
          <ArrowLeftOutlined />
          返回首页
        </a>
      </header>

      <main className="swan-login-main">
        <section className="swan-login-story">
          <span className="swan-public-eyebrow">私人入口</span>
          <h1>回到你的文字</h1>
          <p>登录后继续上次停下的地方。Google、GitHub 和账号密码都会进入同一个雨燕账号。</p>
          <LoginIllustration />
        </section>

        <section className="swan-login-panel">
          <div className="swan-login-card">
            <span className="swan-public-eyebrow">登录雨燕</span>
            <h2>继续写作</h2>
            <p className="swan-login-intro">选择你习惯的方式进入。</p>
            {authNotice && <Alert type="warning" showIcon title={authNotice} />}
            {loginError && <Alert type="error" showIcon title={loginError} />}
            <Form<PasswordLoginValues>
              className="swan-login-form"
              layout="vertical"
              requiredMark={false}
              onFinish={(values) => void submitPassword(values)}
            >
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined />}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  autoComplete="current-password"
                  placeholder="输入登录密码"
                />
              </Form.Item>
              <Button type="primary" size="large" htmlType="submit" loading={submitting} block>
                进入雨燕
                <ArrowRightOutlined />
              </Button>
            </Form>
            <div className="swan-login-divider">
              <span>也可以从这里回来</span>
            </div>
            <div className="swan-login-social">
              <Button size="large" icon={<GoogleOutlined />} onClick={() => signIn('google')}>
                Google
              </Button>
              <Button size="large" icon={<GithubOutlined />} onClick={() => signIn('github')}>
                GitHub
              </Button>
            </div>
            <p className="swan-login-hint">
              <SafetyCertificateOutlined />
              首次设置密码，请先用 Google 或 GitHub 登录，再从账号菜单完成。
            </p>
          </div>
        </section>
      </main>
      {enableSpeedInsights && <SpeedInsights route="/login" />}
    </div>
  );
}
