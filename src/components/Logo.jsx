/** Elastic three-bar "e" mark */
export function ElasticMark({ height = 22 }) {
  return (
    <svg height={height} viewBox="0 0 30 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Elastic">
      <rect x="0" y="0"    width="30" height="6.5" rx="3"   fill="#FEC514"/>
      <rect x="0" y="7.75" width="21" height="6.5" rx="3"   fill="#F04E98"/>
      <rect x="0" y="15.5" width="30" height="6.5" rx="3"   fill="#00BFB3"/>
    </svg>
  );
}

/** AWS smile-arc mark */
export function AwsMark({ height = 14 }) {
  return (
    <svg height={height} viewBox="0 0 52 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Amazon Web Services">
      <path d="M 2 5 C 16 13 36 13 47 5" stroke="#FF9900" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
      <polygon points="42,2 50,5 42,8" fill="#FF9900"/>
    </svg>
  );
}

export function PipelineLogo({size=32, light=false}) {
  const endFill = light ? "#1D1E24" : "#1e293b";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="8"  r="2.8" fill={light?"#FEC514":"#FEC514"}/>
      <circle cx="4" cy="16" r="2.8" fill={light?"#F04E98":"#F04E98"}/>
      <circle cx="4" cy="24" r="2.8" fill={light?"#1BA9F5":"#1BA9F5"}/>
      <circle cx="4" cy="32" r="2.8" fill={light?"#00BFB3":"#00BFB3"}/>
      <circle cx="4" cy="20" r="2.8" fill={light?"#93C90E":"#93C90E"} opacity="0.85"/>
      <line x1="7" y1="8"  x2="18" y2="20" stroke="#FEC514" strokeWidth="1.6" strokeLinecap="round" opacity={light?0.8:0.9}/>
      <line x1="7" y1="16" x2="18" y2="20" stroke="#F04E98" strokeWidth="1.6" strokeLinecap="round" opacity={light?0.8:0.9}/>
      <line x1="7" y1="24" x2="18" y2="20" stroke="#1BA9F5" strokeWidth="1.6" strokeLinecap="round" opacity={light?0.8:0.9}/>
      <line x1="7" y1="32" x2="18" y2="20" stroke="#00BFB3" strokeWidth="1.6" strokeLinecap="round" opacity={light?0.8:0.9}/>
      <line x1="7" y1="20" x2="18" y2="20" stroke="#93C90E" strokeWidth="1.6" strokeLinecap="round" opacity={light?0.8:0.85}/>
      <rect x="18.5" y="13.5" width="3" height="13" rx="1.5" fill="url(#cg)"/>
      <line x1="22" y1="20" x2="33" y2="20" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.9"/>
      <circle cx="36" cy="20" r="3.5" fill="white" opacity="0.95"/>
      <circle cx="36" cy="20" r="2" fill={endFill}/>
      <circle cx="36" cy="20" r="1" fill="white" opacity="0.8"/>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#FEC514"/>
          <stop offset="25%" stopColor="#F04E98"/>
          <stop offset="50%" stopColor="#93C90E"/>
          <stop offset="75%" stopColor="#1BA9F5"/>
          <stop offset="100%" stopColor="#00BFB3"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
