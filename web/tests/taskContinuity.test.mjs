import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { safeReturnPath, signInUrl, signInDestination, withInterfaceLanguage } = await load('../lib/authNavigation.ts');
const { initialCalendarDay, calendarDayForKey } = await load('../components/posts/calendarNavigation.ts');

test('sign-in preserves the actual task, query, fragment and interface language', () => {
  const original = '/posts?post=4&recommendation=1#caption';
  const url = new URL(signInUrl(original, 'ru'), 'https://isramarket.invalid');
  assert.equal(url.pathname, '/login');
  assert.equal(url.searchParams.get('lang'), 'ru');
  assert.equal(url.searchParams.get('next'), '/posts?post=4&recommendation=1&lang=ru#caption');
  assert.equal(signInDestination(url.searchParams.get('next'), { onboarding_complete: true }, 'he'), '/posts?post=4&recommendation=1&lang=ru#caption');
  assert.equal(withInterfaceLanguage('/support?lang=en', 'ar'), '/support?lang=en');
  assert.equal(new URL(signInUrl('/posts?post=4&lang=en', 'he'), 'https://isramarket.invalid').searchParams.get('lang'), 'en');
});

test('support return works without a business; absent return resumes the correct setup', () => {
  assert.equal(signInDestination('/support', null, 'en'), '/support?lang=en');
  assert.equal(signInDestination(null, null, 'en'), '/start?lang=en');
  assert.equal(signInDestination(null, { onboarding_complete: false }, 'he'), '/onboarding?lang=he');
  assert.equal(signInDestination(null, { onboarding_complete: false, quarter_plan: { strategy: 'saved' } }, 'ar'), '/dashboard?lang=ar');
});

test('untrusted redirects cannot leave the site, invoke the API, or loop through auth', () => {
  for (const value of [null, '', 'javascript:alert(1)', 'https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example', '/%2fevil.example', '/%0alogin', '/backend/auth/google/start', '/%62ackend/auth/google/start', '/a/../backend', '/a/../login', '/login?next=/support', '/signup', '/reset/token', '/bad%url', '/a b', '/'+ 'x'.repeat(513)]) {
    assert.equal(safeReturnPath(value), null, String(value));
    assert.equal(signInDestination(value, { onboarding_complete: true }, 'en'), '/dashboard?lang=en');
  }
  assert.equal(safeReturnPath('/integrations?next=https%3A%2F%2Fexample.com'), '/integrations?next=https%3A%2F%2Fexample.com');
  assert.equal(safeReturnPath('/strategy#quarter'), '/strategy#quarter');
});

test('the current month selects today; a different plan month selects its first day', () => {
  const today = new Date(2026, 9, 9);
  assert.equal(initialCalendarDay(2026, 10, today), 9);
  assert.equal(initialCalendarDay(2026, 9, today), 1);
  assert.equal(initialCalendarDay(2025, 10, today), 1);
});

test('keyboard movement follows RTL/LTR and remains within the displayed month', () => {
  assert.equal(calendarDayForKey('ArrowLeft', 9, 2026, 10, true), 10);
  assert.equal(calendarDayForKey('ArrowRight', 9, 2026, 10, true), 8);
  assert.equal(calendarDayForKey('ArrowLeft', 9, 2026, 10, false), 8);
  assert.equal(calendarDayForKey('ArrowRight', 9, 2026, 10, false), 10);
  assert.equal(calendarDayForKey('ArrowUp', 2, 2026, 10, false), 1);
  assert.equal(calendarDayForKey('ArrowDown', 27, 2024, 2, false), 29);
  assert.equal(calendarDayForKey('ArrowDown', 27, 2025, 2, true), 28);
  assert.equal(calendarDayForKey('Home', 9, 2026, 10, true), 4);
  assert.equal(calendarDayForKey('End', 9, 2026, 10, false), 10);
  assert.equal(calendarDayForKey('Enter', 9, 2026, 10, false), null);
});
