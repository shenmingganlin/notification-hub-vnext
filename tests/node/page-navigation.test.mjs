import assert from 'node:assert/strict';
import test from 'node:test';

import {
  navigationSurfaceLink,
  PAGE_NAVIGATION_SCRIPT,
  renderPageNavigation
} from '../../plugin/routes/page-navigation.js';

test('page navigation keeps a stable server fallback for the current Page surface', () => {
  assert.equal(
    navigationSurfaceLink('#settings', '/api/plugins/notification-hub-vnext/notification-center?token=t1'),
    '#settings'
  );
});

test('page navigation uses client-side route loading instead of navigating to a new Page document', () => {
  const html = renderPageNavigation({ active: 'notification-center', currentUrl: '/api/plugins/notification-hub-vnext/notification-center?token=t1' });
  assert.match(html, /data-page-navigation-path="#settings"/);
  assert.match(PAGE_NAVIGATION_SCRIPT, /hana\.api\.fetch/);
  assert.match(PAGE_NAVIGATION_SCRIPT, /pluginIframeTicket/);
  assert.match(PAGE_NAVIGATION_SCRIPT, /notification-hub-view-before-unload/);
});

test('page navigation renders active links including diagnostics', () => {
  const html = renderPageNavigation({ active: 'notification-center', currentUrl: 'https://hana.local/plugin/notification-center?token=t1' });
  assert.match(html, /id="page-nav-notification-center"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /id="page-nav-settings"/);
  assert.match(html, /href="#settings"/);
  assert.match(html, /id="page-nav-runtime"/);
  assert.match(html, /href="#runtime"/);
  assert.match(html, /Runtime/);
  assert.match(html, /id="page-nav-diagnostics"/);
  assert.match(html, /href="#diagnostics"/);
  assert.match(PAGE_NAVIGATION_SCRIPT, /view === "diagnostics"/);
  assert.doesNotMatch(html, /即将开放/);
  assert.match(html, /<svg/);
});
