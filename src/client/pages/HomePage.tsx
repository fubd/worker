import { ArrowRightOutlined } from '@ant-design/icons';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Link } from 'react-router';

import { BRAND } from '@/shared/brand';
import { useAuth } from '../auth/AuthProvider';
import { BrandMark } from '../components/BrandMark';

const enableSpeedInsights = import.meta.env.PROD;

function HomePaperScene() {
  return (
    <section className="swan-home-scene" aria-label="雨燕文档与飞行轨迹插画">
      <article className="swan-home-paper">
        <span className="swan-home-paper-meta">TODAY / 11.22</span>
        <h2>窗外的风</h2>
        <div className="swan-home-paper-lines" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </article>
      <span className="swan-home-paper is-back" aria-hidden="true" />
      <svg className="swan-home-flight" viewBox="0 0 530 260" fill="none" aria-hidden="true">
        <path
          d="M4 230C86 186 116 100 202 118C277 134 284 217 361 169C420 132 446 68 526 34"
          stroke="#8CB6EF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="5 9"
        />
      </svg>
      <svg className="swan-home-swift" viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path
          d="M2 26C18 9 34 7 47 17C56 12 67 12 78 18C67 22 59 29 56 38C47 34 41 35 36 42L27 56L25 41C16 34 8 30 2 26Z"
          fill="#2F6FE8"
        />
      </svg>
      <span className="swan-home-scene-caption">想法不必完整，先让它起飞。</span>
    </section>
  );
}

export default function HomePage() {
  const { status } = useAuth();
  const primaryPath = status === 'authenticated' ? '/docs' : '/login';
  const primaryLabel = status === 'authenticated' ? '进入文档' : '开始写作';

  return (
    <div className="swan-home">
      <header className="swan-public-header">
        <Link className="swan-public-brand" to="/" aria-label="雨燕首页">
          <BrandMark size={36} />
          <span>
            <strong>{BRAND.name}</strong>
            <small>{BRAND.tagline}</small>
          </span>
        </Link>
        <nav className="swan-public-nav" aria-label="首页导航">
          <a href="#about-yuyan">为什么是雨燕</a>
          <Link className="swan-public-login" to={primaryPath}>
            {status === 'authenticated' ? '进入文档' : '登录'}
          </Link>
        </nav>
      </header>

      <main>
        <section className="swan-home-hero">
          <div className="swan-home-copy">
            <span className="swan-public-eyebrow">Yuyan / 雨燕</span>
            <h1>
              让文字
              <br />
              <em>飞起来。</em>
            </h1>
            <p>给还没写完的念头留一处安静的地方。打开就能写，离开也会保存，下一次回来继续往前。</p>
            <div className="swan-home-actions">
              <Link className="swan-public-button is-primary" to={primaryPath}>
                {primaryLabel}
                <ArrowRightOutlined />
              </Link>
              <a className="swan-public-button is-secondary" href="#about-yuyan">
                看看雨燕
              </a>
            </div>
            <ul className="swan-home-proof" aria-label="产品特点">
              <li>私人空间</li>
              <li>自动保存</li>
              <li>随时续写</li>
            </ul>
          </div>
          <HomePaperScene />
        </section>

        <section className="swan-home-about" id="about-yuyan">
          <div>
            <span className="swan-public-eyebrow">安静地写</span>
            <h2>没有信息流，只有你的文字。</h2>
          </div>
          <div className="swan-home-about-points">
            <p>
              <strong>属于自己</strong>
              文档只对所有者开放，内容不会进入公开信息流。
            </p>
            <p>
              <strong>一直保存</strong>
              每一次修改都会自动保存，不必反复点击保存按钮。
            </p>
            <p>
              <strong>继续向前</strong>
              下次回来时，仍然从停下的那一句话继续写。
            </p>
          </div>
        </section>
      </main>

      <footer className="swan-public-footer">
        <span>
          {BRAND.name} · {BRAND.tagline}
        </span>
        <Link to={primaryPath}>{status === 'authenticated' ? '打开文档' : '登录雨燕'}</Link>
      </footer>
      {enableSpeedInsights && <SpeedInsights route="/" />}
    </div>
  );
}
