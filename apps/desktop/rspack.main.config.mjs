import { resolve } from 'node:path'

const __dirname = new URL('.', import.meta.url).pathname

export default {
  target: 'electron-main',
  entry: './src/main/index.ts',
  output: {
    path: resolve(__dirname, 'dist/main'),
    filename: 'index.js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
            target: 'es2022',
          },
          module: {
            type: 'commonjs',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  externals: {
    electron: 'commonjs electron',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
}
