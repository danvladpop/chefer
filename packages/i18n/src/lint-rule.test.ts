import { RuleTester, type Rule } from 'eslint';
import { describe, it } from 'vitest';
import { noHardcodedUiString } from '@chefer/eslint-config/rules/no-hardcoded-ui-string';

// The warn-only guard from ADR 0002: new UI text goes through t().
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-hardcoded-ui-string', noHardcodedUiString as Rule.RuleModule, {
  valid: [
    { code: "<Text>{t('common.actions.save')}</Text>" },
    { code: '<Text>{count}</Text>' },
    { code: '<Text> · </Text>' },
    { code: '<Text>kcal</Text>' },
    { code: '<View testID="settings-title" className="flex-1" />' },
    { code: "<Input placeholder={t('auth.email')} />" },
    { code: '<Text>{`${grams} g`}</Text>' },
  ],
  invalid: [
    { code: '<Text>Save</Text>', errors: [{ messageId: 'hardcoded' }] },
    { code: "<Text>{'Save'}</Text>", errors: [{ messageId: 'hardcoded' }] },
    { code: '<Input placeholder="Email" />', errors: [{ messageId: 'hardcoded' }] },
    { code: '<Pressable accessibilityLabel="Back" />', errors: [{ messageId: 'hardcoded' }] },
    { code: "<b aria-label={'Close'} />", errors: [{ messageId: 'hardcoded' }] },
    {
      code: "<Text>{done ? 'Saved' : 'Save'}</Text>",
      errors: [{ messageId: 'hardcoded' }, { messageId: 'hardcoded' }],
    },
    { code: '<Text>{`${n} recipes`}</Text>', errors: [{ messageId: 'hardcoded' }] },
    { code: '<Text>Rețete</Text>', errors: [{ messageId: 'hardcoded' }] },
  ],
});
