import K from "../theme/index.js";

export function StatusPill({children, color, dot, light}) {
  const bg = light ? "rgba(255,255,255,0.12)" : `${color}18`;
  const border = light ? "rgba(255,255,255,0.3)" : `${color}44`;
  const textColor = light ? "#fff" : color;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:500,color:textColor,background:bg,border:`1px solid ${border}`,borderRadius:99,padding:"3px 10px"}}>
      {dot && <span style={{width:6,height:6,borderRadius:"50%",background:textColor,animation:"pulse 1.2s infinite"}}/>}
      {children}
    </span>
  );
}
