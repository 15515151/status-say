export function LeafMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 27V13m0 8C5 22 3 11 8 10c5-1 8 5 8 11Zm0-5C15 5 22 3 25 7c3 5-2 10-9 9Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function BotIllustration() {
  return <svg className="bot-illustration" viewBox="0 0 340 174" fill="none" aria-hidden="true">
    <ellipse cx="205" cy="149" rx="79" ry="9" fill="#dfe8df" />
    <circle cx="208" cy="83" r="69" stroke="#dce5dd" strokeDasharray="3 7" />
    <path d="M48 106h52l12-15 15 29 12-14h21M273 93h17l9-13 11 25 10-12h16" stroke="#bbcfb5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="144" y="53" width="116" height="89" rx="29" fill="#fefefe" stroke="#799979" strokeWidth="2" />
    <rect x="155" y="69" width="94" height="53" rx="19" fill="#e5eedf" />
    <rect x="170" y="85" width="8" height="15" rx="4" fill="#466747" />
    <rect x="225" y="85" width="8" height="15" rx="4" fill="#466747" />
    <path d="M194 102c4 5 11 5 15 0" stroke="#466747" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M201 53V27m0 14c-22 2-34-17-23-22 10-5 24 9 23 22Zm0-6c-1-20 14-27 20-19 8 10-8 22-20 19Z" fill="#a5c18e" stroke="#66865a" strokeWidth="2" strokeLinejoin="round" />
    <path d="m139 88-7 3v18l7 3m126-24 7 3v18l-7 3" stroke="#799979" strokeWidth="3" strokeLinecap="round" />
    <circle cx="278" cy="37" r="14" fill="#e4eedf" /><path d="m273 37 3 3 6-6" stroke="#66865a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M119 43v10m-5-5h10M291 131v8m-4-4h8" stroke="#b0c5a5" strokeWidth="2" strokeLinecap="round" />
    <circle cx="89" cy="70" r="3" fill="#c8d8c1" />
    <rect x="195" y="131" width="15" height="3" rx="1.5" fill="#adc4a4" />
  </svg>;
}
