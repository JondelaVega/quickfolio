// Lint rules for what the type checker can't see: promises nobody awaits, async callbacks where a plain one is
// expected, switches that miss a case, and conditions the types already decide. Which layer may import which is
// checked by src/architecture.test.ts.
//
// Layout is Prettier's, except what Prettier never does: add braces, add blank lines, or break a long string,
// comment or template. Those rules are here, and `npm run fix` applies them before Prettier formats.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
   { ignores: ['dist/', 'coverage/'] },
   js.configs.recommended,
   tseslint.configs.recommendedTypeChecked,
   {
      languageOptions: {
         parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      },
      rules: {
         '@typescript-eslint/switch-exhaustiveness-check': 'error',
         '@typescript-eslint/no-unnecessary-condition': 'error',
      },
   },
   {
      // Every if, else and loop body in braces; Prettier then puts each brace on its own line.
      // 137 matches Prettier's printWidth, so this only reports lines Prettier can't break.
      // Blank lines around blocks, before a return and after declarations, so each step of a function stands apart.
      plugins: { '@stylistic': stylistic },
      rules: {
         curly: ['error', 'all'],
         '@stylistic/max-len': ['error', { code: 137 }],
         '@stylistic/padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: '*', next: ['block-like', 'return'] },
            { blankLine: 'always', prev: 'block-like', next: '*' },
            { blankLine: 'always', prev: ['const', 'let'], next: '*' },
            { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
         ],
      },
   },
   {
      // Fakes are written `async` so that a throw becomes a rejection, as it would in the real thing.
      files: ['**/*.test.ts', 'src/test/**'],
      rules: { '@typescript-eslint/require-await': 'off' },
   },
   {
      // Plain scripts sit outside the TypeScript project.
      files: ['**/*.js'],
      extends: [tseslint.configs.disableTypeChecked],
   },
   {
      // Runs in the page before the app, so a theme never flashes the default.
      files: ['public/theme-boot.js'],
      languageOptions: { globals: { document: 'readonly', localStorage: 'readonly' } },
      rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
   },
);
