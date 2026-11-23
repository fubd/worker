import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { BRAND } from '@/shared/brand';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';

interface LoginValues {
  identifier: string;
  password: string;
}

interface RegisterValues {
  username: string;
  password: string;
  confirmation: string;
}

type AuthMode = 'login' | 'register';

const enableSpeedInsights = import.meta.env.PROD;

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.6818 9c0-.5932.1023-1.17.2823-1.71V4.9582H.9574A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9574 4.0418L3.964 10.71Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function authErrorMessage(value: string | null): string | null {
  if (value === 'denied') return '未能确认这个账号的已验证邮箱，请换一种登录方式。';
  if (value === 'cancelled') return '登录已取消，你可以重新尝试。';
  if (value === 'unavailable') return '登录服务还没有配置完成，请稍后重试。';
  if (value === 'identity_in_use') return '这个登录方式已经绑定了其他雨燕账号。';
  if (value === 'bind_required') return '请先登录，再绑定新的登录方式。';
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
  const { status, signIn, register, signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identifierDraft, setIdentifierDraft] = useState('');
  const authNotice = authErrorMessage(searchParams.get('auth'));
  const registrationUsername = identifierDraft.includes('@') ? '' : identifierDraft;

  if (status === 'authenticated') return <Navigate to="/docs" replace />;

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError(null);
  };

  const submitLogin = async (values: LoginValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await signInWithPassword(values.identifier, values.password);
      navigate('/docs', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (values: RegisterValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await register({
        username: values.username,
        password: values.password,
      });
      navigate('/docs', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '注册失败，请稍后重试');
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
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.8} />
          返回首页
        </a>
      </header>

      <main className="swan-login-main">
        <section className="swan-login-story">
          <span className="swan-public-eyebrow">私人入口</span>
          <h1>回到你的文字</h1>
          <p>登录后继续上次停下的地方。Google、GitHub 和账号密码可以关联到同一个雨燕账号。</p>
          <LoginIllustration />
        </section>

        <section className="swan-login-panel">
          <div className="swan-login-card">
            <span className="swan-public-eyebrow">
              {mode === 'login' ? '登录雨燕' : '创建雨燕账号'}
            </span>
            <h2>{mode === 'login' ? '继续写作' : '从名字开始'}</h2>
            <p className="swan-login-intro">
              {mode === 'login'
                ? '使用账号名或已验证邮箱登录，回到你的文字。'
                : '先设置账号名和密码开始写作，之后可以绑定 Google 或 GitHub。'}
            </p>
            {authNotice && <Alert type="warning" showIcon title={authNotice} />}
            {formError && <Alert type="error" showIcon title={formError} />}
            {mode === 'login' ? (
              <Form<LoginValues>
                key="login"
                className="swan-login-form"
                initialValues={{ identifier: identifierDraft }}
                layout="vertical"
                requiredMark={false}
                onValuesChange={(changed) => {
                  if (typeof changed.identifier === 'string') {
                    setIdentifierDraft(changed.identifier);
                  }
                }}
                onFinish={(values) => void submitLogin(values)}
              >
                <Form.Item
                  name="identifier"
                  label="账号名或邮箱"
                  rules={[{ required: true, message: '请输入账号名或邮箱' }]}
                >
                  <Input
                    size="large"
                    prefix={<UserRound aria-hidden="true" size={16} strokeWidth={1.8} />}
                    autoComplete="username"
                    placeholder="账号名或 you@example.com"
                  />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />}
                    autoComplete="current-password"
                    placeholder="输入登录密码"
                  />
                </Form.Item>
                <Button type="primary" size="large" htmlType="submit" loading={submitting} block>
                  进入雨燕
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
                </Button>
                <p className="swan-login-switch">
                  还没有账号？
                  <button type="button" onClick={() => changeMode('register')}>
                    创建账号
                  </button>
                </p>
              </Form>
            ) : (
              <Form<RegisterValues>
                key="register"
                className="swan-login-form"
                initialValues={{ username: registrationUsername }}
                layout="vertical"
                requiredMark={false}
                onValuesChange={(changed) => {
                  if (typeof changed.username === 'string') {
                    setIdentifierDraft(changed.username);
                  }
                }}
                onFinish={(values) => void submitRegister(values)}
              >
                <Form.Item
                  name="username"
                  label="账号名"
                  normalize={(value: string) => value.trim().toLowerCase()}
                  rules={[
                    { required: true, message: '请输入账号名' },
                    {
                      pattern: /^[\p{L}\p{N}](?:[\p{L}\p{N}_-]{1,30})[\p{L}\p{N}]$/u,
                      message: '需要 3–32 个字符，以文字或数字开头和结尾',
                    },
                  ]}
                >
                  <Input size="large" autoComplete="username" placeholder="例如 yuyan_writer" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 10, message: '密码至少需要 10 个字符' },
                    { max: 128, message: '密码不能超过 128 个字符' },
                  ]}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />}
                    autoComplete="new-password"
                    placeholder="至少 10 个字符"
                  />
                </Form.Item>
                <Form.Item
                  name="confirmation"
                  label="确认密码"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: '请再次输入密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        return !value || getFieldValue('password') === value
                          ? Promise.resolve()
                          : Promise.reject(new Error('两次输入的密码不一致'));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />}
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                  />
                </Form.Item>
                <Button type="primary" size="large" htmlType="submit" loading={submitting} block>
                  创建并进入
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
                </Button>
                <p className="swan-login-switch">
                  已经有账号？
                  <button type="button" onClick={() => changeMode('login')}>
                    返回登录
                  </button>
                </p>
              </Form>
            )}
            <div className="swan-login-divider">
              <span>或使用已验证邮箱</span>
            </div>
            <div className="swan-login-social">
              <Button size="large" icon={<GoogleIcon />} onClick={() => signIn('google')}>
                Google
              </Button>
              <Button size="large" icon={<GithubIcon />} onClick={() => signIn('github')}>
                GitHub
              </Button>
            </div>
            <p className="swan-login-hint">
              <ShieldCheck aria-hidden="true" size={14} strokeWidth={1.8} />
              账号名和密码可以先开始使用；绑定 Google 或 GitHub 后可找回账号并跨设备恢复。
            </p>
          </div>
        </section>
      </main>
      {enableSpeedInsights && <SpeedInsights route="/login" />}
    </div>
  );
}
