import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../lib/postTracking.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { postDestination, messageWithLink, wantsWhatsapp } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const website = { primary_outlet: 'instagram', cta: 'Visit our website', tracking_url: 'https://example.com/?utm_content=p-one' };
const whatsapp = { ...website, cta: 'Message us on WhatsApp', measure: { metric: 'whatsapp_clicks' } };
const ready = { number_set: true, cta_is_whatsapp: true, link: { url: 'https://isramarket.co.il/r/post-one' } };
test('missing WhatsApp setup never falls back to a website destination', () => {
  for (const state of [null, { ...ready, number_set: false }, { ...ready, link: null }, { ...ready, cta_is_whatsapp: false }]) {
    assert.equal(postDestination(whatsapp, state), '');
  }
});
test('the post link takes precedence for WhatsApp and the site URL stays intact for a site post', () => {
  assert.equal(postDestination(whatsapp, ready), ready.link.url);
  assert.equal(postDestination(website, { number_set: true, cta_is_whatsapp: false, link: null }), website.tracking_url);
});
test('server-recognised WhatsApp CTA takes precedence over an untranslated caption', () => {
  assert.equal(postDestination({ ...website, cta: 'Напишите нам' }, ready), ready.link.url);
});
test('explicit measure, outlet and supported CTA text all identify the required WhatsApp destination', () => {
  assert.equal(wantsWhatsapp({ measure: { metric: 'whatsapp_clicks' } }), true);
  assert.equal(wantsWhatsapp({ primary_outlet: 'whatsapp', cta: 'Ask us' }), true);
  assert.equal(wantsWhatsapp({ cta: 'כתבו בווצאפ' }), true);
  assert.equal(wantsWhatsapp(website), false);
});
test('copy/share preserves the owner caption and adds only the resolved destination', () => {
  const text = 'An owner’s own words\nwith their line breaks';
  assert.equal(messageWithLink(text, ready.link.url), text + '\n\n' + ready.link.url);
  assert.equal(messageWithLink(text, ''), text);
});
