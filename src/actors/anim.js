// Poses are flat Float32Arrays: three Euler angles per joint, then a hip offset.
// Clips are keyed poses; locomotion is generated from phase and speed.
import { PI, lerp, clamp, sstep } from '../core/util.js';
import { JI, NJ, PL } from './rig.js';

export function P(o,base){const a=new Float32Array(PL);if(base)a.set(base);for(const k in o){const v=o[k],i=(k==='pos'?NJ:JI[k])*3;a[i]=v[0]||0;a[i+1]=v[1]||0;a[i+2]=v[2]||0;}return a;}
function S(o,n,x,y,z){const i=JI[n]*3;o[i]=x||0;o[i+1]=y||0;o[i+2]=z||0;}
const UP=['spine','chest','neck','shL','elL','haL','shR','elR','haR','shield'].map(n=>JI[n]);
const ARMS=['shL','elL','haL','shR','elR','haR','shield'].map(n=>JI[n]),TORSO=['spine','chest','neck'].map(n=>JI[n]);
function addJ(o,p,w,list){for(const j of list){const i=j*3;o[i]+=p[i]*w;o[i+1]+=p[i+1]*w;o[i+2]+=p[i+2]*w;}}
const UPB=['shL','elL','haL','shield','spine','neck'].map(n=>JI[n]);
const LOW=['hips','thL','knL','anL','thR','knR','anR'].map(n=>JI[n]).concat([NJ]);
function mix(o,p,w,list){for(const j of list){const i=j*3;o[i]=lerp(o[i],p[i],w);o[i+1]=lerp(o[i+1],p[i+1],w);o[i+2]=lerp(o[i+2],p[i+2],w);}}
export const PZ={};
PZ.guard=P({hips:[0,-.42,0],pos:[0,-.07,0],spine:[.1,.1,0],chest:[0,.1,0],neck:[-.04,.26,0],
  thL:[-.5,.3,.1],knL:[.55],anL:[-.08],thR:[.34,-.1,-.12],knR:[.5],anR:[-.5],
  shL:[-.55,0,.22],elL:[-1.25,0,-.5],haL:[0],shield:[0,-.3,0],
  shR:[.3,0,-.42],elR:[-1.05],haR:[.35]});
const B=o=>P(o,PZ.guard);
PZ.block=B({spine:[.2,.3,0],neck:[.02,.1,0],shL:[-1.15,0,-.1],elL:[-1.35,0,-.9],shield:[0,-.2,0]});
// light 1: right-to-left cut
PZ.l1w=B({hips:[0,-.75,0],spine:[.05,-.35,0],chest:[0,-.35,0],neck:[0,.95,0],shR:[.25,-.75,-1.25],elR:[-.75],haR:[.8],shL:[-.9,0,.1],elL:[-1.0,0,-.5]});
PZ.l1s=B({hips:[.1,.1,0],pos:[0,-.14,0],spine:[.16,.45,0],chest:[0,.45,0],neck:[-.05,-.75,0],shR:[.15,2.05,-1.2],elR:[-.2],haR:[1.15],
  thL:[-.85,.3,.1],knL:[.95],thR:[.5,-.1,-.12],knR:[.25],shL:[.3,0,.5],elL:[-1.1]});
PZ.l1f=P({shR:[.25,2.45,-1.1],elR:[-.5],haR:[1.3],spine:[.16,.55,0]},PZ.l1s);
// light 2: backhand left-to-right
PZ.l2w=P({shR:[-.1,2.55,-1.15],elR:[-.9],haR:[1.9],spine:[.12,.6,0],chest:[0,.55,0]},PZ.l1s);
PZ.l2s=B({hips:[.05,-.7,0],pos:[0,-.12,0],spine:[.08,-.45,0],chest:[0,-.45,0],neck:[0,1.0,0],shR:[-.25,-.35,-1.45],elR:[-.12],haR:[2.0],
  thL:[-.75,.3,.1],knL:[.85],thR:[.45,-.1,-.12],knR:[.3],shL:[-.3,0,.35],elL:[-1.3]});
PZ.l2f=P({shR:[-.3,-.75,-1.5],elR:[-.3],haR:[2.15]},PZ.l2s);
// thrust
PZ.thw=B({hips:[0,-.85,0],pos:[0,-.12,0],spine:[.1,-.3,0],chest:[0,-.2,0],neck:[0,1.1,0],shR:[.75,0,-.3],elR:[-2.2],haR:[1.05],shL:[-1.25,0,-.2],elL:[-.5],shield:[0,-.6,0]});
PZ.ths=B({hips:[.3,.15,0],pos:[0,-.22,.1],spine:[.22,.3,0],chest:[0,.2,0],neck:[-.4,-.4,0],shR:[-2.02,0,.2],elR:[-.04],haR:[1.5],
  thL:[-1.2,.2,.1],knL:[1.15],anL:[-.2],thR:[.55,-.1,-.1],knR:[.12],anR:[-.6],shL:[.6,0,.4],elL:[-.9]});
// shield bash
PZ.bw=B({hips:[0,-.1,0],spine:[.05,.5,0],shL:[.3,0,.35],elL:[-1.7,0,-.3],shR:[.5,0,-.5],elR:[-.9]});
PZ.bs=B({hips:[.2,-.95,0],pos:[0,-.16,.08],spine:[.2,-.2,0],neck:[-.1,1.0,0],shL:[-1.45,0,-.25],elL:[-.75,0,-.9],shield:[0,-.15,0],
  thL:[-1.0,.3,.1],knL:[1.0],thR:[.5,-.1,-.1],knR:[.2],shR:[.7,0,-.5],elR:[-.7]});
// rising cut (launcher)
PZ.uw=B({hips:[.25,-.6,0],pos:[0,-.32,0],spine:[.3,-.3,0],neck:[-.3,.8,0],thL:[-.9,.3,.1],knL:[1.3],thR:[.1,-.1,-.1],knR:[1.2],shR:[.6,0,-.45],elR:[-.25],haR:[1.2]});
PZ.us=B({hips:[-.12,.1,0],pos:[0,.32,0],spine:[-.22,.25,0],neck:[.3,-.2,0],thL:[-.25,0,.08],knL:[.5],thR:[.35,0,-.08],knR:[.9],shR:[-2.85,0,-.12],elR:[-.05],haR:[1.15],shL:[.5,0,.6],elL:[-.6]});
// heavy overhead
PZ.hw=B({hips:[-.12,-.4,0],pos:[0,.03,0],spine:[-.22,-.15,0],chest:[-.1,0,0],neck:[.25,.5,0],shR:[-2.95,0,-.3],elR:[-1.25],haR:[.5],shL:[-1.1,0,.3],elL:[-.7],thL:[-.45,.3,.1],knL:[.4]});
PZ.hs=B({hips:[.34,.05,0],pos:[0,-.3,.06],spine:[.4,.2,0],chest:[.1,.1,0],neck:[-.5,-.2,0],shR:[-.72,0,.12],elR:[-.05],haR:[1.3],
  thL:[-1.05,.3,.1],knL:[1.25],anL:[-.2],thR:[.5,-.1,-.1],knR:[.5],anR:[-.6],shL:[.5,0,.45],elL:[-1.0]});
PZ.hs2=P({pos:[0,-.36,.06],shR:[-.55,0,.12]},PZ.hs);
// leap (sprint attack)
PZ.leap=B({hips:[.15,0,0],pos:[0,.55,0],spine:[-.25,0,0],neck:[.2,0,0],thL:[-1.5,0,.1],knL:[1.7],thR:[.2,0,-.1],knR:[1.5],shR:[-3.0,0,-.25],elR:[-.9],haR:[.6],shL:[-1.6,0,.5],elL:[-.6]});
// roll
PZ.r0=P({hips:[.9,0,0],pos:[0,-.42,0],spine:[.75],chest:[.3],neck:[.5],thL:[-1.7,0,.1],knL:[2.1],thR:[-1.5,0,-.1],knR:[2.1],shL:[-.7,0,.25],elL:[-1.7],shR:[-.5,0,-.35],elR:[-1.6],haR:[.9]});
PZ.r1=P({hips:[3.3,0,0],pos:[0,-.28,0]},PZ.r0);
PZ.r2=P({hips:[5.6,0,0],pos:[0,-.45,0]},PZ.r0);
PZ.r3=B({hips:[6.55,-.42,0],pos:[0,-.3,0],thL:[-.9,.3,.1],knL:[1.4],thR:[-.2,-.1,-.1],knR:[1.5]});
// backstep
PZ.bk=B({hips:[-.2,-.42,0],pos:[0,.14,0],spine:[.3,.1,0],thL:[-.6,.3,.1],knL:[.4],thR:[-.35,-.1,-.1],knR:[.5],shR:[.5,0,-.6],elR:[-.8]});
PZ.bk2=B({pos:[0,-.2,0],hips:[.2,-.42,0],thL:[-.7,.3,.1],knL:[.95],thR:[.5,-.1,-.12],knR:[.9]});
// reactions
PZ.hit=B({hips:[-.3,-.2,0],pos:[0,-.05,-.05],spine:[-.35,.2,0],neck:[-.45,0,0],shR:[.4,0,-.9],elR:[-.6],shL:[.3,0,.8],elL:[-.7]});
PZ.par=B({spine:[.05,.75,0],chest:[0,.3,0],neck:[0,-.6,0],shL:[-1.2,0,.9],elL:[-.6,0,-.2],shield:[0,.3,0]});
PZ.stun=B({hips:[-.15,-.2,0],pos:[0,-.12,0],spine:[-.3,.3,0],neck:[-.35,.2,.2],shR:[.5,0,-.9],elR:[-.4],haR:[1.2],shL:[.2,0,.7],elL:[-.5],thL:[-.3,.2,.1],knL:[.7],thR:[.2,-.1,-.12],knR:[.7]});
PZ.d1=P({hips:[.25,0,0],pos:[0,-.42,0],spine:[.5],neck:[.5],thL:[-.9,0,.1],knL:[1.9],anL:[.3],thR:[-.4,0,-.1],knR:[1.8],anR:[.3],shL:[.2,0,.3],elL:[-.3],shR:[.3,0,-.3],elR:[-.3],haR:[1.3]});
PZ.d2=P({hips:[1.45,0,0],pos:[0,-.74,.2],spine:[.1],neck:[.2],thL:[-.1,0,.15],knL:[.15],thR:[-.05,0,-.15],knR:[.1],shL:[-1.9,0,.7],elL:[-.5],shR:[-1.2,0,-.9],elR:[-.4],haR:[1.4]});
PZ.air=P({hips:[-.9,0,0],pos:[0,-.1,0],spine:[-.3],neck:[-.4],thL:[-.7,0,.3],knL:[.8],thR:[-.2,0,-.3],knR:[.9],shL:[-.5,0,1.3],elL:[-.4],shR:[-.3,0,-1.4],elR:[-.3],haR:[1]});
PZ.down=P({hips:[-1.5,0,0],pos:[0,-.72,-.15],spine:[-.05],neck:[-.1],thL:[-.25,0,.2],knL:[.3],thR:[-.1,0,-.2],knR:[.15],shL:[-.2,0,1.1],elL:[-.3],shR:[-.1,0,-1.2],elR:[-.2],haR:[1]});
// The false ending at the Glass Door (story/mission.js): beaten to his knees, cut down, and hauled back up by the glass in him.
PZ.prone=P({hips:[1.5,0,0],pos:[0,-.56,.2],spine:[.02],neck:[-.3,.7,0]},PZ.d2); // face down on the floor, head turned: d2 raised so a big armoured body lies on the stone, not in it
PZ.kneel=P({spine:[.42],chest:[.16],neck:[.6],shR:[.22,0,-.22],elR:[-.12],haR:[1.45],shL:[.15,0,.3],elL:[-.35]},PZ.d1);
PZ.kneelHit=P({spine:[.1,.25,0],chest:[0,.2,0],neck:[-.25,.3,.2],shR:[.3,0,-.6],shL:[.2,0,.6]},PZ.kneel);
PZ.exw=P({shR:[-2.8,0,-.12],elR:[-.75],haR:[.25],spine:[-.26,-.1,0],neck:[.3,.4,0]},PZ.hw); // sword high, both eyes on the man at his feet
PZ.ex=P({hips:[.16,.05,0],pos:[0,-.2,.04],spine:[.24,.2,0],chest:[.06,.1,0],neck:[-.3,-.2,0]},PZ.hs);PZ.ex2=P({pos:[0,-.24,.04],shR:[-.55,0,.12]},PZ.ex); // the captain's last blow: the heavy cut, more upright
PZ.rise1=P({hips:[-.4,0,0],pos:[0,-.36,0],spine:[-.45],chest:[-.32],neck:[-.75],thL:[.55,0,.1],knL:[1.0],anL:[.5],thR:[.4,0,-.1],knR:[1.25],anR:[.5],shL:[.55,0,.5],elL:[-.2],shR:[.55,0,-.5],elR:[-.2],haR:[1.2]});
PZ.rise2=P({hips:[-.12,0,0],pos:[0,.06,0],spine:[-.26],chest:[-.2],neck:[-.55],thL:[.16,0,.06],knL:[.35],anL:[.55],thR:[.05,0,-.06],knR:[.5],anR:[.55],shL:[.22,0,.42],elL:[-.15],shR:[.22,0,-.42],elR:[-.15],haR:[1.2]});
PZ.rise3=B({neck:[.42,.26,0],spine:[.2,.1,0]});
export const EASE={o:u=>1-Math.pow(1-u,3),i:u=>u*u,l:u=>u};
export function C(dur,...keys){return{dur,keys:keys.map(k=>({t:k[0],p:k[1],e:EASE[k[2]]||sstep}))};}
export function sample(c,t,out){const K=c.keys;if(t<=K[0].t){out.set(K[0].p);return;}const n=K.length;if(t>=K[n-1].t){out.set(K[n-1].p);return;}
  let i=0;while(t>=K[i+1].t)i++;const a=K[i],b=K[i+1],u=b.e((t-a.t)/(b.t-a.t));for(let k=0;k<PL;k++)out[k]=a.p[k]+(b.p[k]-a.p[k])*u;}
export const CL={
  l1:C(.48,[.09,PZ.l1w],[.19,PZ.l1s,'o'],[.3,PZ.l1f,'l'],[.48,PZ.guard]),
  l2:C(.5,[.09,PZ.l2w],[.19,PZ.l2s,'o'],[.3,PZ.l2f,'l'],[.5,PZ.guard]),
  l3:C(.68,[.13,PZ.thw],[.22,PZ.ths,'o'],[.4,PZ.ths],[.68,PZ.guard]),
  f1:C(.5,[.08,PZ.bw],[.17,PZ.bs,'o'],[.3,PZ.bs],[.5,PZ.guard]),
  f2:C(.7,[.12,PZ.uw],[.23,PZ.us,'o'],[.42,PZ.us],[.7,PZ.guard]),
  hw:C(.3,[.3,PZ.hw]),
  hs:C(.62,[0,PZ.hw],[.11,PZ.hs,'i'],[.3,PZ.hs2,'o'],[.62,PZ.guard]),
  sa:C(.72,[.1,PZ.leap],[.24,PZ.leap],[.34,PZ.hs,'i'],[.5,PZ.hs2,'o'],[.72,PZ.guard]),
  rp:C(.9,[.14,PZ.thw],[.22,PZ.ths,'i'],[.55,PZ.ths],[.9,PZ.guard]),
  roll:C(.56,[.06,PZ.r0],[.24,PZ.r1,'l'],[.42,PZ.r2,'l'],[.56,PZ.r3,'l']),
  back:C(.36,[.08,PZ.bk],[.26,PZ.bk2],[.36,PZ.guard]),
  hit:C(.4,[.06,PZ.hit,'o'],[.4,PZ.guard]),
  par:C(.34,[.07,PZ.par,'o'],[.34,PZ.guard]),
  stun:C(.3,[.14,PZ.stun,'o']),
  death:C(1.1,[.3,PZ.d1],[.75,PZ.d2,'i']),
  air:C(.2,[.12,PZ.air,'o']),
  down:C(.2,[.14,PZ.down,'i']),
  kneel:C(1.1,[.4,PZ.d1],[1.1,PZ.kneel]),
  fall:C(.85,[0,PZ.kneel],[.1,PZ.kneelHit,'o'],[.85,PZ.prone,'i']),
  rise:C(3.1,[0,PZ.prone],[1.15,PZ.rise1],[2.05,PZ.rise2],[2.4,PZ.rise2],[2.62,PZ.rise3,'i'],[3.1,PZ.guard]),
  raise:C(.3,[.3,PZ.exw]),
  exec:C(1.5,[0,PZ.exw],[.11,PZ.ex,'i'],[.3,PZ.ex2,'o'],[1.5,PZ.ex2]), // the heavy overhead, held where it lands
};
const sideRoll=s=>C(.56,[.06,P({hips:[.35,0,s*.9],pos:[0,-.42,0]},PZ.r0)],[.24,P({hips:[.35,0,s*3.3],pos:[0,-.3,0]},PZ.r0),'l'],[.42,P({hips:[.35,0,s*5.6],pos:[0,-.45,0]},PZ.r0),'l'],
  [.56,B({hips:[0,-.42,s*6.283],pos:[0,-.3,0],thL:[-.9,.3,.1],knL:[1.4],thR:[-.2,-.1,-.1],knR:[1.5]}),'l']);
CL.sideL=sideRoll(-1);CL.sideR=sideRoll(1);
export function eClip(style,w,rec){
  const W=style==='over'?PZ.hw:style==='thrust'?PZ.thw:PZ.l1w,Sx=style==='over'?PZ.hs:style==='thrust'?PZ.ths:PZ.l1s;
  return C(w+.3+rec,[w*.5,W],[w,W],[w+.1,Sx,'i'],[w+.34,Sx],[w+.3+rec*.8,PZ.guard]);}

// Stride amplitude for a normalized speed.
export const stride=s=>Math.min(1,s*3.5)*(.34+.6*clamp(s,0,1));
// The pelvis turns so each hip leads with its own leg, the shoulders turn against it, and the
// feet stay pointed down the line of travel.
export function locoPose(o,c,t){
  o.fill(0);
  const s=c.speedN,run=clamp(s,0,1),A=stride(s),idle=1-Math.min(1,s*3),tk=-.6;
  const sn=Math.sin(c.phase),cs=Math.cos(c.phase),ly=c.strafeS,sa=c.strafe,br=Math.sin(t*1.9+c.seed),yaw=sn*.14*A*tk;
  const lean=.2*run,c2=Math.cos(c.phase*2+.6),sw=Math.sin(t*.8+c.seed),sw2=Math.sin(t*1.15+c.seed*2);
  S(o,'hips',lean*Math.cos(sa),ly+yaw,-lean*Math.sin(sa)+c.turnLean-cs*.04*A);
  const pi=NJ*3;o[pi+1]=-.02+Math.cos(c.phase*2)*.045*A+br*.012*idle;
  S(o,'spine',.05+.06*run-c.recoil*.35+c.accF,-ly-sn*.3*A*tk+c.twist+sw*.05*idle,cs*.06*A-c.accS+sw2*.03*idle);
  S(o,'chest',br*.045*idle+c2*.05*A+c.accF*.5,-sn*.22*A*tk+c.twist*.5,cs*.04*A-c.accS*.5);
  S(o,'neck',-.14*run+br*.015-c2*.04*A,sn*.16*A*tk-c.twist*.8-sw*.04*idle,-cs*.05*A);
  S(o,'thL',-sn*A-.14*run,0,.05);S(o,'thR',sn*A-.14*run,0,-.05);
  S(o,'knL',.08+A*1.6*Math.max(0,cs)+.12*run);S(o,'knR',.08+A*1.6*Math.max(0,-cs)+.12*run);
  S(o,'anL',-.06+.28*sn*A,-yaw);S(o,'anR',-.06-.28*sn*A,-yaw);
  S(o,'shL',sn*.6*A+.05,0,.14);S(o,'elL',-.3-.7*run);S(o,'shield',-1.35-.3*run);
  // (the shield hangs point-down at rest; guard poses zero this so it turns point-down across the raised forearm)
  S(o,'shR',-sn*.42*A+.1+.2*run,0,-.2-.12*run);S(o,'elR',-.4-.5*run);S(o,'haR',.5-.2*run);
  const g=c.guard;
  if(g>0){const gw=g*(1-.6*run);mix(o,PZ.guard,gw,ARMS);addJ(o,PZ.guard,gw,TORSO);mix(o,PZ.guard,g*idle,LOW);
    const bb=Math.sin(t*3.1+c.seed);o[pi+1]+=bb*.014*g*idle;o[JI.shR*3]+=bb*.04*g*idle;o[JI.shL*3]-=bb*.03*g*idle;o[JI.spine*3]+=bb*.02*g*idle;}
  if(c.blockW>0)mix(o,PZ.block,c.blockW,UPB);
}

