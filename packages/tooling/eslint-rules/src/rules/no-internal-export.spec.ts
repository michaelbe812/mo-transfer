import { libFile, ruleTester } from '../testing/rule-tester';
import { noInternalExport, RULE_NAME } from './no-internal-export';

const index = libFile('checkin/state/src/index.ts');

ruleTester.run(RULE_NAME, noInternalExport, {
  valid: [
    { code: "export * from './checkin.store';", filename: index },
    { code: "export { CheckinStore } from './checkin.store';", filename: index },
    { code: "export type { CheckSummary } from '@mo-transfer/booking/types';", filename: index },
    // `internal` as a file name part is no folder
    { code: "export * from './internal-notes';", filename: index },
    // inside the lib internal/ is free — only the public API is checked
    { code: "export * from './internal/next-checkin-id';", filename: libFile('checkin/state/src/checkin.store.ts') },
    { code: "export * from './internal/next-checkin-id';", filename: libFile('checkin/state/src/sub/index.ts') },
  ],
  invalid: [
    {
      code: "export * from './internal/next-checkin-id';",
      filename: index,
      errors: [{ messageId: 'internalExport', data: { lib: 'libs/checkin/state', source: './internal/next-checkin-id' } }],
    },
    { code: "export { nextCheckinId } from './internal/next-checkin-id';", filename: index, errors: [{ messageId: 'internalExport' }] },
    { code: "export * from './internal';", filename: index, errors: [{ messageId: 'internalExport' }] },
    { code: "export * from './sub/internal/x';", filename: index, errors: [{ messageId: 'internalExport' }] },
    {
      code: "import { nextCheckinId } from './internal/next-checkin-id';\nexport { nextCheckinId };",
      filename: index,
      errors: [{ messageId: 'internalExport', line: 1 }],
    },
  ],
});
