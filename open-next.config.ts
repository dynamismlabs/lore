import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is client-rendered against tRPC, so there is no ISR/data cache to
// configure; the defaults are enough.
export default defineCloudflareConfig({});
