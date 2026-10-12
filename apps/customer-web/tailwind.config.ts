import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'], theme: { extend: { colors: { forest: '#24533e', leaf: '#c7f36a' } } }, plugins: [] } satisfies Config;
