import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  { ignores: ['.next/**', '.open-next/**', '.wrangler/**', 'cloudflare-env.d.ts'] },
];

export default eslintConfig;
