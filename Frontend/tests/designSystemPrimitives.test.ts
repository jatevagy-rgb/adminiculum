import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Button,
  IconButton,
  Badge,
  StatusChip,
  PageHeader,
  Card,
  Panel,
  Modal,
  EmptyState,
  Alert,
  Input,
  Textarea,
  Select,
  Label,
  FormField,
  FormError,
} from '../src/components/ui';
import { AdminButton, AdminBadge, AdminStatusPill } from '../src/components/adminiculum/ui';

test('Button primitive renders default button type="button" and primary styles', () => {
  const html = renderToStaticMarkup(React.createElement(Button, { variant: 'primary' }, 'Mentés'));
  assert.ok(html.includes('type="button"'), 'Button must default to type="button"');
  assert.ok(html.includes('#0F3D32'), 'Primary button must use canonical brand green #0F3D32');
  assert.ok(html.includes('Mentés'));
});

test('Button primitive preserves submit type when explicitly requested', () => {
  const html = renderToStaticMarkup(React.createElement(Button, { type: 'submit' }, 'Küldés'));
  assert.ok(html.includes('type="submit"'), 'Button must allow explicit type="submit"');
});

test('Button primitive handles disabled and loading states correctly', () => {
  const disabledHtml = renderToStaticMarkup(React.createElement(Button, { disabled: true }, 'Inaktív'));
  assert.ok(disabledHtml.includes('disabled=""'), 'Disabled button must set disabled attribute');

  const loadingHtml = renderToStaticMarkup(React.createElement(Button, { isLoading: true }, 'Betöltés'));
  assert.ok(loadingHtml.includes('aria-busy="true"'), 'Loading button must declare aria-busy');
  assert.ok(loadingHtml.includes('animate-spin'), 'Loading button must render spinner');
  assert.ok(loadingHtml.includes('disabled=""'), 'Loading button must be disabled');
});

test('IconButton requires aria-label and renders accessible attributes', () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, { 'aria-label': 'Bezárás' }, '×')
  );
  assert.ok(html.includes('aria-label="Bezárás"'));
  assert.ok(html.includes('type="button"'));
});

test('Badge and StatusChip map semantic status to canonical tones', () => {
  const activeBadge = renderToStaticMarkup(React.createElement(Badge, { status: 'active' }, 'Aktív'));
  assert.ok(activeBadge.includes('#0F3D32'), 'Active status must map to green tone');

  const draftBadge = renderToStaticMarkup(React.createElement(Badge, { status: 'draft' }, 'Tervezet'));
  assert.ok(draftBadge.includes('#92400E') || draftBadge.includes('#FEF3C7'), 'Draft status must map to gold/amber tone');

  const urgentBadge = renderToStaticMarkup(React.createElement(Badge, { status: 'urgent' }, 'Sürgős'));
  assert.ok(urgentBadge.includes('#991B1B') || urgentBadge.includes('#FEE2E2'), 'Urgent status must map to danger tone');

  const chip = renderToStaticMarkup(React.createElement(StatusChip, { status: 'active', dot: true }, 'Folyamatban'));
  assert.ok(chip.includes('rounded-full'), 'StatusChip must have rounded-full pill shape');
  assert.ok(chip.includes('rounded-full bg-current'), 'StatusChip with dot must render dot indicator');
});

test('PageHeader renders title, subtitle, and primary CTA slot', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      PageHeader,
      {
        title: 'Ügyek áttekintése',
        subtitle: 'Összesített lista',
        primaryAction: React.createElement(Button, { variant: 'primary' }, 'Új ügy'),
      }
    )
  );
  assert.ok(html.includes('Ügyek áttekintése'));
  assert.ok(html.includes('Összesített lista'));
  assert.ok(html.includes('Új ügy'));
});

test('Card and Panel render clean surfaces with 1px border and 12px radius', () => {
  const cardHtml = renderToStaticMarkup(React.createElement(Card, null, 'Tartalom'));
  assert.ok(cardHtml.includes('rounded-[12px]'));
  assert.ok(cardHtml.includes('border-[#E5E7E6]'));
  assert.ok(cardHtml.includes('bg-white'));
});

test('Modal renders dialog role and accessible close label', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Modal,
      {
        open: true,
        onClose: () => {},
        title: 'Ügyfél szerkesztése',
      },
      'Űrlap mezők'
    )
  );
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('aria-label="Bezárás"'));
  assert.ok(html.includes('Ügyfél szerkesztése'));
});

test('EmptyState renders title, description, and optional action', () => {
  const html = renderToStaticMarkup(
    React.createElement(EmptyState, {
      title: 'Nincs megjeleníthető ügy',
      description: 'Próbáld módosítani a szűrőket.',
      action: React.createElement(Button, null, 'Szűrők törlése'),
    })
  );
  assert.ok(html.includes('Nincs megjeleníthető ügy'));
  assert.ok(html.includes('Szűrők törlése'));
});

test('Alert renders semantic variants with accessible roles', () => {
  const errorHtml = renderToStaticMarkup(
    React.createElement(Alert, { variant: 'error', title: 'Hiba történt' }, 'Nem sikerült menteni.')
  );
  assert.ok(errorHtml.includes('role="alert"'));
  assert.ok(errorHtml.includes('Hiba történt'));

  const successHtml = renderToStaticMarkup(
    React.createElement(Alert, { variant: 'success', title: 'Sikeres mentés' }, 'Módosítások rögzítve.')
  );
  assert.ok(successHtml.includes('role="status"'));
  assert.ok(successHtml.includes('Sikeres mentés'));
});

test('Form primitives render inputs, labels, and error states', () => {
  const inputHtml = renderToStaticMarkup(React.createElement(Input, { placeholder: 'Keresés' }));
  assert.ok(inputHtml.includes('h-10'));
  assert.ok(inputHtml.includes('rounded-[8px]'));

  const errorInputHtml = renderToStaticMarkup(React.createElement(Input, { isError: true }));
  assert.ok(errorInputHtml.includes('border-red-500'));

  const formFieldHtml = renderToStaticMarkup(
    React.createElement(
      FormField,
      { label: 'Ügyfél neve', required: true, error: 'Kötelező mező' },
      React.createElement(Input, { isError: true })
    )
  );
  assert.ok(formFieldHtml.includes('Ügyfél neve'));
  assert.ok(formFieldHtml.includes('*'));
  assert.ok(formFieldHtml.includes('Kötelező mező'));
  assert.ok(formFieldHtml.includes('role="alert"'));
});

test('AdminButton and legacy components remain 100% backward compatible', () => {
  const adminBtnHtml = renderToStaticMarkup(
    React.createElement(AdminButton, { variant: 'primary', size: 'md' }, 'Régi gomb')
  );
  assert.ok(adminBtnHtml.includes('type="button"'));
  assert.ok(adminBtnHtml.includes('Régi gomb'));

  const badgeHtml = renderToStaticMarkup(
    React.createElement(AdminBadge, { tone: 'green', dot: true }, 'Régi badge')
  );
  assert.ok(badgeHtml.includes('Régi badge'));

  const pillHtml = renderToStaticMarkup(
    React.createElement(AdminStatusPill, { tone: 'neutral' }, 'Régi pill')
  );
  assert.ok(pillHtml.includes('rounded-full'));
  assert.ok(pillHtml.includes('Régi pill'));
});
