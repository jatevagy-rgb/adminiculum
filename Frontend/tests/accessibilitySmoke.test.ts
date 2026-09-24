import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdminButton,
  AdminBadge,
  AdminStatusPill,
  OperationalPageHeader,
  AdminSectionHeader,
  Button,
  IconButton,
  Modal,
  ConfirmationDialog,
  FormField,
  Input,
  QuietLink,
  CANONICAL_TOKENS,
  calculateContrastRatio,
} from '../src/components/ui';

test('A11Y: Canonical token combinations meet WCAG AA contrast ratios', () => {
  // Brand Green on White
  const greenOnWhite = calculateContrastRatio(CANONICAL_TOKENS.brandGreen.hex, '#FFFFFF');
  assert.ok(greenOnWhite >= 4.5, `Brand Green on White must meet AA (>= 4.5), got ${greenOnWhite}`);

  // Brand Deep on White
  const deepOnWhite = calculateContrastRatio(CANONICAL_TOKENS.brandDeep.hex, '#FFFFFF');
  assert.ok(deepOnWhite >= 4.5, `Brand Deep on White must meet AA (>= 4.5), got ${deepOnWhite}`);

  // Text Primary on White
  const textOnWhite = calculateContrastRatio(CANONICAL_TOKENS.textPrimary.hex, '#FFFFFF');
  assert.ok(textOnWhite >= 4.5, `Text Primary on White must meet AA (>= 4.5), got ${textOnWhite}`);

  // Text Secondary on White
  const textSecOnWhite = calculateContrastRatio(CANONICAL_TOKENS.textSecondary.hex, '#FFFFFF');
  assert.ok(textSecOnWhite >= 4.5, `Text Secondary on White must meet AA (>= 4.5), got ${textSecOnWhite}`);

  // Semantic Danger text on White
  const dangerOnWhite = calculateContrastRatio(CANONICAL_TOKENS.semanticDanger.hex, '#FFFFFF');
  assert.ok(dangerOnWhite >= 4.5, `Semantic Danger on White must meet AA (>= 4.5), got ${dangerOnWhite}`);

  // White text on Brand Green (Primary button)
  const whiteOnGreen = calculateContrastRatio('#FFFFFF', CANONICAL_TOKENS.brandGreen.hex);
  assert.ok(whiteOnGreen >= 4.5, `White text on Brand Green button must meet AA (>= 4.5), got ${whiteOnGreen}`);
});

test('A11Y: Status primitives convey meaning through text, never color-only', () => {
  const pillHtml = renderToStaticMarkup(
    React.createElement(AdminStatusPill, { tone: 'green' }, 'Megfelelő')
  );
  assert.ok(pillHtml.includes('Megfelelő'), 'Status pill must contain descriptive semantic text');

  const badgeHtml = renderToStaticMarkup(
    React.createElement(AdminBadge, { tone: 'burgundy', dot: true }, 'Kritikus hiba')
  );
  assert.ok(badgeHtml.includes('Kritikus hiba'), 'AdminBadge must contain descriptive semantic text');
});

test('A11Y: Interactive buttons and quiet links include visible focus rings', () => {
  const adminBtn = renderToStaticMarkup(
    React.createElement(AdminButton, { variant: 'primary' }, 'Művelet')
  );
  assert.ok(adminBtn.includes('focus-visible:ring'), 'AdminButton must declare focus-visible:ring');

  const quietLink = renderToStaticMarkup(
    React.createElement(QuietLink, { href: '/cases', children: 'Ugrás az ügyekhez' })
  );
  assert.ok(quietLink.includes('focus-visible:ring'), 'QuietLink must declare focus-visible:ring');

  const btn = renderToStaticMarkup(
    React.createElement(Button, { variant: 'primary', children: 'Mentés' })
  );
  assert.ok(btn.includes('focus-visible:ring'), 'Button must declare focus-visible:ring');
});

test('A11Y: Modal renders accessible dialog role, aria-modal, and labelledby', () => {
  const modalHtml = renderToStaticMarkup(
    React.createElement(
      Modal,
      { open: true, onClose: () => {}, title: 'Ügyfél adatok', children: React.createElement('p', null, 'Tartalom') }
    )
  );
  assert.ok(modalHtml.includes('role="dialog"'), 'Modal must have role="dialog"');
  assert.ok(modalHtml.includes('aria-modal="true"'), 'Modal must declare aria-modal="true"');
  assert.ok(modalHtml.includes('aria-labelledby'), 'Modal must link title via aria-labelledby');
  assert.ok(modalHtml.includes('aria-label="Bezárás"'), 'Modal close button must have accessible aria-label');
});

test('A11Y: ConfirmationDialog renders accessible dialog attributes and explicit buttons', () => {
  const dialogHtml = renderToStaticMarkup(
    React.createElement(ConfirmationDialog, {
      open: true,
      title: 'Törlés megerősítése',
      description: 'Biztosan törölni kívánja a kijelölt iratot?',
      confirmLabel: 'Törlés',
      cancelLabel: 'Mégse',
      onConfirm: () => {},
      onCancel: () => {},
    })
  );
  assert.ok(dialogHtml.includes('role="dialog"'), 'ConfirmationDialog must have role="dialog"');
  assert.ok(dialogHtml.includes('aria-modal="true"'), 'ConfirmationDialog must declare aria-modal="true"');
  assert.ok(dialogHtml.includes('Törlés'), 'Dialog must show explicit confirm button');
  assert.ok(dialogHtml.includes('Mégse'), 'Dialog must show explicit cancel button');
});

test('A11Y: FormField renders explicit accessible label and associates error state', () => {
  const formFieldHtml = renderToStaticMarkup(
    React.createElement(
      FormField,
      {
        label: 'Ügyvédi azonosító',
        required: true,
        error: 'Kötelező mező kitöltése',
        help: 'A kamara által kiadott KÜJ szám.',
        children: React.createElement(Input, { placeholder: 'KÜJ-12345' }),
      }
    )
  );
  assert.ok(formFieldHtml.includes('Ügyvédi azonosító'), 'Label must be present');
  assert.ok(formFieldHtml.includes('Kötelező mező kitöltése'), 'Error text must be rendered');
  assert.ok(formFieldHtml.includes('A kamara által kiadott KÜJ szám.'), 'Helper text must be rendered');
});

test('A11Y: OperationalPageHeader and AdminSectionHeader enforce clean heading hierarchy without duplicate H1', () => {
  const pageHeaderH1 = renderToStaticMarkup(
    React.createElement(OperationalPageHeader, { title: 'Ügyek áttekintése' })
  );
  assert.ok(pageHeaderH1.includes('<h1'), 'OperationalPageHeader defaults to h1');

  const pageHeaderH2 = renderToStaticMarkup(
    React.createElement(OperationalPageHeader, { title: 'Al-munkapad', level: 'h2' })
  );
  assert.ok(pageHeaderH2.includes('<h2'), 'OperationalPageHeader supports level="h2" for sub-pages');

  const sectionHeader = renderToStaticMarkup(
    React.createElement(AdminSectionHeader, { title: 'Csatolt dokumentumok' })
  );
  assert.ok(sectionHeader.includes('<h3'), 'AdminSectionHeader defaults to h3 to avoid duplicate H1');
});
