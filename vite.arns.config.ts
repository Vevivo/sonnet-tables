import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

const project=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig(({mode})=>{
 const settings=loadEnv(mode,project,'SONNET_');
 const configured=process.env.SONNET_API_BASE??settings.SONNET_API_BASE;
 if(!configured)throw new Error('Set SONNET_API_BASE to your backend origin before building the ArNS frontend.');
 const url=new URL(configured);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
  (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))){
  throw new Error('SONNET_API_BASE must be an HTTPS origin, or an HTTP loopback origin for local development.');
 }
 return {
  root:resolve(project,'arns'),base:'./',publicDir:resolve(project,'public'),
  plugins:[react()],resolve:{alias:{'@':project}},
  define:{__SONNET_API_BASE__:JSON.stringify(url.origin),__SONNET_ASSET_BASE__:JSON.stringify('.')},
  build:{outDir:resolve(project,'dist-arns'),emptyOutDir:true,sourcemap:false},
 };
});
