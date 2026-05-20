export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce security architecture import boundaries.',
    },
    schema: [],
    messages: {
      handlerDaoImport: 'Handlers must not import DAO directly. Use a UseCase or AccessService.',
      handlerGatewayImport: 'Handlers must not import dangerous runtime directly. Use a gateway.',
      serviceChildProcess: 'Services must not import child_process directly. Use CommandGateway.',
    },
  },
  create(context) {
    const filename = context.getFilename().replaceAll('\\\\', '/')
    return {
      ImportDeclaration(node) {
        const value = String(node.source.value)
        if (filename.includes('/handlers/') && value.includes('/dao/')) {
          context.report({ node, messageId: 'handlerDaoImport' })
        }
        if (filename.includes('/handlers/') && value === '@shadowob/cloud') {
          context.report({ node, messageId: 'handlerGatewayImport' })
        }
        if (
          filename.includes('/services/') &&
          (value === 'node:child_process' || value === 'child_process')
        ) {
          context.report({ node, messageId: 'serviceChildProcess' })
        }
      },
    }
  },
}
