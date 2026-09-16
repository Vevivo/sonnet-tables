import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';

export default defineConfig({
 plugins:[
  vinext(),
  cloudflare({
   configPath:'wrangler.jsonc',
   viteEnvironment:{name:'rsc',childEnvironments:['ssr']},
   inspectorPort:false,
  }),
 ],
});
