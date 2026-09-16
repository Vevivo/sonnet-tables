import {profileTier,type MemberProfile} from './member-profile';
import {assetUrl} from './client-urls';
import {shortDid} from './sonnet-types';
export const BADGE_WIDTH=1200,BADGE_HEIGHT=1600;
const colors={bronze:['#e9ac76','#98613b'],silver:['#edf6fc','#94adbf'],gold:['#ffe29b','#c5912e'],unverified:['#a6bbce','#65778a']};
export async function renderProfileCard(canvas:HTMLCanvasElement,profile:MemberProfile){
 const art=new Image();art.src=assetUrl('/assets/robot-medallion-tiers.webp');await art.decode();
 canvas.width=BADGE_WIDTH;canvas.height=BADGE_HEIGHT;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export is unavailable in this browser.');
 const tier=profileTier(profile),[light,dark]=colors[tier];
 const fill=ctx.createLinearGradient(0,0,1200,1600);fill.addColorStop(0,'#142943');fill.addColorStop(.35,'#030f20');fill.addColorStop(1,'#101a2c');ctx.fillStyle=fill;ctx.fillRect(0,0,1200,1600);
 const frame=ctx.createLinearGradient(0,0,1200,1600);frame.addColorStop(0,light);frame.addColorStop(.2,dark);frame.addColorStop(.5,'#f5f6dd');frame.addColorStop(.65,dark);frame.addColorStop(1,light);
 ctx.strokeStyle=frame;ctx.lineWidth=9;ctx.beginPath();ctx.roundRect(24,24,1152,1552,54);ctx.stroke();ctx.strokeStyle='#3d6279';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(45,45,1110,1510,37);ctx.stroke();
 const text=(value:string,x:number,y:number,size:number,color='#f0f6ff',weight=500,align:CanvasTextAlign='left')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.textAlign=align;ctx.fillText(value,x,y);};
 text('SONNET TABLES',90,113,34,'#b6edff',700);text('SONNET 02',1110,111,24,'#9bb4c9',600,'right');
 ctx.strokeStyle='#284b63';ctx.beginPath();ctx.moveTo(90,145);ctx.lineTo(1110,145);ctx.stroke();
 const panel=art.naturalWidth/3,idx=tier==='gold'?2:tier==='silver'?1:0;
 ctx.save();ctx.globalCompositeOperation='lighten';if(tier==='unverified')ctx.filter='grayscale(1)';ctx.drawImage(art,idx*panel,140,panel,720,275,160,650,914);ctx.restore();
 // A soft data panel leaves every achievement and identity label legible.
 const shade=ctx.createLinearGradient(0,900,0,1160);shade.addColorStop(0,'rgba(5,15,30,0)');shade.addColorStop(1,'#071324');ctx.fillStyle=shade;ctx.fillRect(65,900,1070,310);
 text(tier==='unverified'?'HISTORY RECONCILING':`${tier.toUpperCase()} EDITION`,600,1030,28,light,700,'center');
 const name=profile.person?.registration==='confirmed'?profile.person.name:shortDid(profile.did);
 text(name,600,1107,Math.min(70,850/Math.max(name.length,1)*1.6),'#f0f6ff',700,'center');
 text(profile.person?.registration==='confirmed'?`REGISTERED ${profile.person.role.toUpperCase()}`:'PUBLIC PARTICIPATION RECORD',600,1150,25,'#96b4ca',500,'center');
 ctx.fillStyle='#0e2338';ctx.beginPath();ctx.roundRect(90,1200,1020,151,20);ctx.fill();ctx.strokeStyle='#315067';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.moveTo(600,1225);ctx.lineTo(600,1324);ctx.stroke();
 text(profile.historyReady?String(profile.completed.length):profile.completed.length?`${profile.completed.length}+`:'—',345,1270,59,light,700,'center');text('ACCEPTED POEMS',345,1321,23,'#a9c1d4',600,'center');
 text(String(profile.active.length),855,1270,59,light,700,'center');text('CURRENT TABLES',855,1321,23,'#a9c1d4',600,'center');
 text(profile.historyReady?'SIGNED RECORDS · VERIFIED SUBMISSIONS OBSERVED':'VERIFIED MINIMUM · MORE HISTORY BEING RECONCILED',600,1398,22,'#81d0e4',600,'center');
 text(profile.did,600,1444,21,'#a5bbcf',500,'center');
 const stamp=profile.updatedAt?new Date(profile.updatedAt).toISOString().slice(0,16).replace('T',' ')+' UTC':'History pending';
 text(stamp,90,1511,21,'#93aabf');text('sonnet tables',1110,1511,24,light,600,'right');
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create the badge image.')),'image/png'));
}
