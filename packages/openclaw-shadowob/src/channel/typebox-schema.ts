type TypeBoxCompatibleSchema = Record<PropertyKey, unknown>

const TYPEBOX_KIND = Symbol.for('TypeBox.Kind')
const TYPEBOX_OPTIONAL = Symbol.for('TypeBox.Optional')
const OPENCLAW_TYPEBOX_KIND = '~kind'
const OPENCLAW_TYPEBOX_OPTIONAL = '~optional'

function typeboxSchema(kind: string, schema: Record<string, unknown>): TypeBoxCompatibleSchema {
  Object.defineProperties(schema, {
    [TYPEBOX_KIND]: { value: kind },
    [OPENCLAW_TYPEBOX_KIND]: { value: kind },
  })
  return schema
}

function optionalSchema(schema: TypeBoxCompatibleSchema): TypeBoxCompatibleSchema {
  Object.defineProperties(schema, {
    [TYPEBOX_OPTIONAL]: { value: 'Optional' },
    [OPENCLAW_TYPEBOX_OPTIONAL]: { value: 'Optional' },
  })
  return schema
}

function stringSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('String', {
    type: 'string',
    ...(description ? { description } : {}),
  })
}

function numberSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Number', {
    type: 'number',
    ...(description ? { description } : {}),
  })
}

function booleanSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Boolean', {
    type: 'boolean',
    ...(description ? { description } : {}),
  })
}

function literalSchema(value: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Literal', { const: value, type: 'string' })
}

function enumSchema(values: readonly string[], description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Union', {
    anyOf: values.map((value) => literalSchema(value)),
    ...(description ? { description } : {}),
  })
}

function arraySchema(
  items: TypeBoxCompatibleSchema,
  options: Record<string, unknown> = {},
): TypeBoxCompatibleSchema {
  return typeboxSchema('Array', { type: 'array', items, ...options })
}

function objectSchema(
  properties: Record<string, TypeBoxCompatibleSchema>,
  options: Record<string, unknown> = {},
): TypeBoxCompatibleSchema {
  const required = Object.entries(properties)
    .filter(([, schema]) => schema[TYPEBOX_OPTIONAL] !== 'Optional')
    .filter(([, schema]) => schema[OPENCLAW_TYPEBOX_OPTIONAL] !== 'Optional')
    .map(([key]) => key)

  return typeboxSchema('Object', {
    type: 'object',
    properties,
    required,
    ...options,
  })
}

const shadowInteractiveButtonSchema = objectSchema({
  id: stringSchema('Stable button id returned in the interaction response.'),
  label: stringSchema('Button text shown to the user.'),
  value: optionalSchema(stringSchema('Optional value returned when selected.')),
  style: optionalSchema(enumSchema(['primary', 'secondary', 'destructive'])),
})

const shadowInteractiveSelectOptionSchema = objectSchema({
  id: stringSchema('Stable option id returned in the interaction response.'),
  label: stringSchema('Option text shown to the user.'),
  value: stringSchema('Value returned when selected.'),
})

const shadowInteractiveFormFieldSchema = objectSchema({
  id: stringSchema('Stable field id returned in submitted values.'),
  kind: optionalSchema(enumSchema(['text', 'textarea', 'number', 'checkbox', 'select'])),
  type: optionalSchema(
    enumSchema(['text', 'textarea', 'number', 'checkbox', 'select'], 'Alias for kind.'),
  ),
  label: stringSchema('Field label shown to the user.'),
  placeholder: optionalSchema(stringSchema()),
  defaultValue: optionalSchema(stringSchema()),
  required: optionalSchema(booleanSchema()),
  options: optionalSchema(arraySchema(shadowInteractiveSelectOptionSchema, { maxItems: 20 })),
  maxLength: optionalSchema(numberSchema()),
  min: optionalSchema(numberSchema()),
  max: optionalSchema(numberSchema()),
})

export const shadowMessageToolSchemaProperties = {
  kind: optionalSchema(
    enumSchema(
      ['buttons', 'select', 'form', 'approval'],
      'Shadow interactive dialog kind. Use with action "send" when buttons, select, form, or approval UI is needed.',
    ),
  ),
  prompt: optionalSchema(
    stringSchema('Prompt rendered inside a Shadow interactive block; usually match message.'),
  ),
  blockId: optionalSchema(stringSchema('Optional stable interactive block id.')),
  buttons: optionalSchema(arraySchema(shadowInteractiveButtonSchema, { maxItems: 8 })),
  options: optionalSchema(arraySchema(shadowInteractiveSelectOptionSchema, { maxItems: 20 })),
  fields: optionalSchema(arraySchema(shadowInteractiveFormFieldSchema, { maxItems: 12 })),
  submitLabel: optionalSchema(stringSchema('Submit button label for form dialogs.')),
  responsePrompt: optionalSchema(
    stringSchema('Instruction sent back to the Buddy when this form is submitted.'),
  ),
  approvalCommentLabel: optionalSchema(
    stringSchema('Optional comment label for approval dialogs.'),
  ),
  oneShot: optionalSchema(booleanSchema('Disable the dialog after one response.')),
  media: optionalSchema(stringSchema('Attachment source URL or local path for file upload.')),
  mediaUrl: optionalSchema(stringSchema('Alias for media.')),
  url: optionalSchema(stringSchema('Alias for media.')),
  path: optionalSchema(stringSchema('Local attachment path.')),
  filePath: optionalSchema(stringSchema('Local attachment path alias.')),
  file: optionalSchema(stringSchema('Local attachment path alias.')),
  fileUrl: optionalSchema(stringSchema('Attachment URL alias.')),
  buffer: optionalSchema(stringSchema('Base64 attachment payload for file upload.')),
  filename: optionalSchema(stringSchema('Attachment filename when buffer is used.')),
  contentType: optionalSchema(stringSchema('Attachment MIME type when buffer is used.')),
  mimeType: optionalSchema(stringSchema('Alias for contentType.')),
  caption: optionalSchema(stringSchema('Optional text sent with an attachment.')),
} satisfies Record<string, TypeBoxCompatibleSchema>
