import { ESLintUtils } from '@typescript-eslint/utils';

/** Docs anchor per rule: packages/tooling/eslint-rules/README.md#<rule>. */
export const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/michaelbe812/mo-transfer/blob/main/packages/tooling/eslint-rules/README.md#${name}`,
);
