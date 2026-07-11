// ESLint v9 flat config
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.cjs',
      '*.mjs',
      'coverage/**',
      // rl/.venv/ 是 Python virtualenv 里的 JS 文件, 不应被 ESLint 扫
      'rl/.venv/**',
      'rl/**/__pycache__/**',
      // Day0 旧入口, tsconfig 已排除, ESLint 同步排除
      'src/main.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        // browser DOM
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        WebSocket: 'readonly',
        CloseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLInputElement: 'readonly',
        Image: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // fetch / streams (Node 18+ / 浏览器原生)
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        MessageEvent: 'readonly',
        CloseEvent: 'readonly',
        // node
        process: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        // vitest
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // 关掉 v9 默认的 no-unused-vars (它会误报 type/interface 参数)
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // 允许 interface/type 函数签名参数被视为 "使用"
        args: 'after-used',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // scripts/ 里的 console.log 是给用户看的测试输出,不走 log 分级
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];