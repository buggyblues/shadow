type TypeBoxCompatibleSchema = Record<PropertyKey, unknown>

const TYPEBOX_KIND = Symbol.for('TypeBox.Kind')
const TYPEBOX_OPTIONAL = Symbol.for('TypeBox.Optional')

function typeboxSchema(kind: string, schema: Record<string, unknown>): TypeBoxCompatibleSchema {
  return Object.assign(schema, { [TYPEBOX_KIND]: kind })
}

function optionalSchema(schema: TypeBoxCompatibleSchema): TypeBoxCompatibleSchema {
  return Object.assign(schema, { [TYPEBOX_OPTIONAL]: 'Optional' })
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
  serverId: optionalSchema(
    stringSchema('Shadow server UUID or slug for server management actions.'),
  ),
  server_id: optionalSchema(stringSchema('snake_case alias for serverId.')),
  server: optionalSchema(stringSchema('Alias for serverId.')),
  html: optionalSchema(
    stringSchema('Homepage HTML for update-homepage; null resets via direct calls.'),
  ),
  homepageHtml: optionalSchema(stringSchema('Alias for html.')),
  homepage_html: optionalSchema(stringSchema('snake_case alias for html.')),
} satisfies Record<string, TypeBoxCompatibleSchema>
