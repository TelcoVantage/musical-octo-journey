#!/usr/bin/env node
// Builds script-panel/Chat Ticket Panel.script, a Genesys Cloud agent script import file.
// The JSON layout follows Genesys' own script export format. No dependencies:  node generate.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const id = () => crypto.randomUUID();
const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// ---- property helpers ------------------------------------------------------------------------
const spacing = (v) => ({ typeName: 'spacing', value: v });            // number, or [top, right, bottom, left]
const sizing = (sizeType, size) => ({ typeName: 'sizing', value: size === undefined ? { sizeType } : { sizeType, size } });
const AUTO = sizing('auto'), STRETCH = sizing('stretch', 100), px = (n) => sizing('pixels', n);
const color = (hex) => (hex ? { typeName: 'color', value: '#' + hex } : { typeName: 'null' });
const bool = (v) => ({ typeName: 'boolean', value: v });
const itext = (v) => ({ typeName: 'interpolatedText', value: v });
// Border colours are stored without '#'. One object = all sides; an array = top, right, bottom, left.
const side = (width, hex) => ({ width, style: 'solid', color: hex || '000000' });
const border = (v) => ({ typeName: 'border', value: v });
const NO_BORDER = border(side(0));

const base = (o) => ({
  margin: spacing(o.margin === undefined ? 0 : o.margin),
  alignment: { typeName: 'alignment', value: o.align || 'start' },
  width: o.width || AUTO,
  height: o.height || AUTO,
  visible: { typeName: 'variable' },
  preserveLayoutLocation: bool(false)
});
const fontProps = (o) => ({
  bold: bool(!!o.bold), italic: bool(false), underline: bool(false),
  font: { typeName: 'font', value: FONT },
  fontSize: { typeName: 'integer', value: o.size || 10 },   // points
  justification: { typeName: 'text', value: o.justify || 'left' }
});

// ---- components ------------------------------------------------------------------------------
const container = (type) => (o, children) => ({
  type,
  properties: Object.assign(base(Object.assign({ width: STRETCH }, o)), {
    backgroundColor: color(o.bg),
    padding: spacing(o.padding === undefined ? 0 : o.padding),
    childArrangement: { typeName: 'childArrangement', value: 'start' },
    border: o.border || NO_BORDER
  }),
  children
});
const vstack = container('verticalStackContainer');
const hstack = container('horizontalStackContainer');

const text = (value, o = {}) => ({
  type: 'text',
  properties: Object.assign(base(o), { text: itext(value) }, fontProps(o), {
    backgroundColor: color(null), textColor: color(o.color), padding: spacing(0)
  })
});
const button = (label, actionId, o = {}) => ({
  type: 'button',
  properties: Object.assign(base(o), {
    text: itext(label),
    clickAction: { typeName: 'action', value: { actionName: actionId } },
    backgroundColor: color(o.bg), textColor: color(o.color)
  }, fontProps(Object.assign({ justify: 'center' }, o)), { disabled: { typeName: 'variable' } })
});
const multilineInput = (variableId, o = {}) => ({
  type: 'input',
  properties: Object.assign(base(o), {
    placeholderText: itext(o.placeholder || ''),
    label: itext(o.label || ''),
    labelPosition: { typeName: 'labelPosition', value: 'above' },
    labelBold: bool(false), labelItalic: bool(false), labelUnderline: bool(false),
    labelFont: { typeName: 'font', value: FONT },
    labelFontSize: { typeName: 'integer', value: o.labelSize || 10 },
    labelJustification: { typeName: 'text', value: 'left' },
    validation: { typeName: 'inputValidation', value: '' },
    doesRequireValue: bool(false),
    isMultilineInput: bool(true),
    isPasswordInput: bool(false),
    isPasswordToggleVisible: bool(false),
    value: { typeName: 'variable', value: variableId },
    changeAction: { typeName: 'action', value: {} },
    disabled: { typeName: 'variable' }
  })
});

// ---- variables (names and types as in the existing script) -----------------------------------
const variable = (name, type, input, output, value) => ({
  id: id(), name, description: '', type: { isDynamic: false, isList: false, name: type },
  value: value === undefined ? (type === 'number' ? 0 : '') : value, input, output
});
const V = {
  assetId: variable('assetId', 'string', true, false),
  email: variable('email', 'string', true, false),
  fullname: variable('fullname', 'string', true, false),
  InteractionId: variable('InteractionId', 'string', true, true),
  location: variable('location', 'string', true, false),
  ticketDescription: variable('ticketDescription', 'string', false, false),
  ticketReturnCode: variable('ticketReturnCode', 'number', false, false),
  ticketStatus: variable('ticketStatus', 'string', false, false)
};
const ref = (v) => '{{' + v.id + '}}';

// ---- palette ---------------------------------------------------------------------------------
const C = { navy: '1b2a49', headerSub: 'b8c4d9', text: '1f2933', muted: '627d98', status: '486581',
  surface: 'f5f7fa', line: 'd9e2ec', divider: 'e4e7eb', accent: '1a56db', white: 'ffffff' };

// ---- page ------------------------------------------------------------------------------------
const createTicketAction = { id: id(), name: 'Create Ticket', action: { block: [] } };

const detailRow = (label, value) => hstack(
  { padding: [8, 0, 8, 0], border: border([side(0), side(0), side(1, C.divider), side(0)]) },
  [text(label, { width: px(110), size: 10, color: C.muted, align: 'center' }),
    text(value, { size: 11, color: C.text, align: 'center' })]);

const root = vstack({ height: STRETCH, bg: C.white }, [
  vstack({ bg: C.navy, padding: [14, 20, 14, 20] }, [
    text(ref(V.fullname), { size: 15, bold: true, color: C.white }),
    text('Messaging | {{scripter.queueName}}', { size: 10, color: C.headerSub, margin: [3, 0, 0, 0] })
  ]),
  vstack({ padding: [16, 20, 4, 20] }, [
    text('CUSTOMER DETAILS', { size: 9, bold: true, color: C.muted, margin: [0, 0, 4, 0] }),
    detailRow('Full name', ref(V.fullname)),
    detailRow('Email', ref(V.email)),
    detailRow('Location', ref(V.location))
  ]),
  vstack({ margin: [14, 20, 0, 20], padding: 16, bg: C.surface, border: border(side(1, C.line)) }, [
    text('Create ticket', { size: 12, bold: true, color: C.text, margin: [0, 0, 8, 0] }),
    multilineInput(V.ticketDescription.id, { label: 'Description', placeholder: 'Describe the issue', width: STRETCH, height: px(120) }),
    button('Create ticket', createTicketAction.id, { bg: C.accent, color: C.white, bold: true, size: 10, width: px(130), height: px(36), margin: [12, 0, 0, 0] })
  ]),
  text(ref(V.ticketStatus), { size: 10, color: C.status, margin: [12, 20, 0, 20] }),
  hstack({ margin: [8, 20, 20, 20], padding: [12, 16, 12, 16], bg: C.surface, border: border(side(1, C.line)) }, [
    text('Ticket number', { width: px(110), size: 10, color: C.muted, align: 'center' }),
    text(ref(V.InteractionId), { size: 14, bold: true, color: C.text, align: 'center' })
  ])
]);

// ---- script ----------------------------------------------------------------------------------
const feature = (enabled, extra) => ({ properties: Object.assign({ enabled: bool(enabled) }, extra || {}) });
const scriptId = id(), versionId = id(), pageId = id(), orgId = id();
const script = {
  id: scriptId,
  name: 'Chat Ticket Panel',
  organizationId: orgId,
  versionId,
  startPageId: pageId,
  pages: [{
    id: pageId, name: 'Chat Page', organizationId: orgId, scriptId, versionId,
    properties: { onLoadAction: { typeName: 'action', value: {} }, backgroundColor: { typeName: 'null' } },
    dataVersion: 0,
    rootContainer: root
  }],
  features: {
    dialer: feature(false, { contactListId: { typeName: 'text', value: '' }, onContactDataLoadAction: { typeName: 'action', value: {} } }),
    scripter: feature(true), screenPop: feature(false), callback: feature(false),
    chat: feature(true), email: feature(false), message: feature(true),
    bridge: feature(true),                       // "bridge" is the Data Actions property
    uuiData: feature(false), customerSecuredData: feature(false), list: feature(false), workItem: feature(false)
  },
  variables: Object.values(V),
  customActions: [createTicketAction],
  dataVersion: 0
};

const out = path.join(__dirname, '..', '..', 'script-panel', 'Chat Ticket Panel.script');
fs.writeFileSync(out, JSON.stringify(script, null, 2) + '\n');
console.log('Wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
