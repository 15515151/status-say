import { HeartHandshake, QrCode, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import PageIntro from '../../components/layout/PageIntro';
import PageLayout from '../../components/layout/PageLayout';
import './sponsor.css';

const paymentMethods = [
  {
    id: 'wechat',
    name: '微信赞赏',
    hint: '使用微信扫一扫',
    image: 'https://r2say.qqun.top/wxzsm.png',
  },
  {
    id: 'alipay',
    name: '支付宝',
    hint: '使用支付宝扫一扫',
    image: 'https://r2say.qqun.top/zfb.png',
  },
] as const;

function SponsorCard({ method }: { method: (typeof paymentMethods)[number] }) {
  const [failed, setFailed] = useState(false);

  return <article className={`sponsor-card sponsor-${method.id}`}>
    <div className="sponsor-card-heading">
      <span className="sponsor-method-icon"><QrCode size={19} /></span>
      <div><h2>{method.name}</h2><p>{method.hint}</p></div>
    </div>
    <a className="sponsor-code" href={method.image} target="_blank" rel="noreferrer" aria-label={`查看${method.name}收款码原图（新窗口打开）`}>
      {!failed
        ? <img src={method.image} alt={`${method.name}收款二维码`} referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)} />
        : <span className="sponsor-code-error"><QrCode size={31} /><strong>二维码暂时未能加载</strong><small>点击此处尝试打开原图</small></span>}
    </a>
    <p className="sponsor-card-note">扫码前请核对收款信息，按自己的心意支持即可。</p>
  </article>;
}

export default function SponsorPage() {
  return <PageLayout title="赞助支持" healthy stateLabel="感谢支持" footerStatus="谢谢你来到这里" note="每一份支持，都让香菜走得更远">
    <PageIntro eyebrow="XIANGCAI / SPONSOR" title="请香菜加一份餐" description="如果这个小项目刚好帮到了你，可以请香菜吃点好吃的。你的心意会用来维持服务和继续改进体验。" />

    <section className="sponsor-section" aria-labelledby="sponsor-title">
      <div className="sponsor-message">
        <span className="sponsor-heart"><HeartHandshake size={25} /></span>
        <div><h2 id="sponsor-title">谢谢你的喜欢</h2><p>赞助完全自愿，也请量力而行。即使只是来看看，香菜也很开心。</p></div>
        <span className="sponsor-safe"><ShieldCheck size={15} />安全扫码</span>
      </div>
      <div className="sponsor-grid">
        {paymentMethods.map(method => <SponsorCard key={method.id} method={method} />)}
      </div>
    </section>
  </PageLayout>;
}
