export class GameError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const check=(value,message,status=400)=>{if(!value)throw new GameError(message,status);};
export const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
