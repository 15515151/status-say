import { LeafMark } from '../brand/BotIllustration';

export default function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-intro">
    <div className="eyebrow"><LeafMark size={16} />{eyebrow}</div>
    <h1>{title}</h1>
    <p>{description}</p>
  </div>;
}
