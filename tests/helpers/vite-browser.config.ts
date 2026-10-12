import {defineConfig} from 'vite';

// Browser campaigns exercise a fixed source revision. HMR reconnects can reload
// a live siege, and watching generated trace/evidence files can fail on Windows
// file locks. Neither behavior belongs in the production-game acceptance run.
export default defineConfig({server:{hmr:false,watch:null}});
