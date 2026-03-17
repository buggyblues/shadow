# GitHub Actions 自动化方案（SDK 发布 + PR 检查）

本文档对应以下 workflow：

- `.github/workflows/publish-packages.yml`
- `.github/workflows/pr-checks.yml`

目标：

1. SDK（npm + pip）使用 Token 发布（NPM_TOKEN / PYPI_TOKEN），自动发布并创建 Release。
2. SDK npm/python 版本强一致。
3. PR 中跑完整 tests + docker-compose E2E，并在 PR 评论中回传结果与截图清单。
4. 支持高效调试与人工可控试跑。

## 一、SDK 发布认证（npm + PyPI）

### 1) npm 发布凭证（@shadowob/sdk）

在 GitHub 仓库 Secrets 中配置：

- `NPM_TOKEN`: npm access token（可发布 `@shadowob/sdk`）

### 2) PyPI 发布凭证（shadowob-sdk）

在 GitHub 仓库 Secrets 中配置：

- `PYPI_TOKEN`: PyPI API Token（`pypi-...`）

### 3) 权限要求

`publish-packages.yml` 已声明：

- `contents: write`（提交版本 bump、打 tag、创建 release）

## 二、版本一致性

新增脚本：`scripts/check-sdk-version-consistency.mjs`

校验：

- `packages/sdk/package.json` 的 version
- `packages/sdk-python/pyproject.toml` 的 version

并新增根脚本：

- `pnpm check:sdk-versions`

该校验在：

- PR checks 中执行（防止不一致代码合入）
- 发布流 bump 前后执行（防止错误发布）

## 三、发布流程说明（publish-packages.yml）

触发方式：`workflow_dispatch`

输入参数：

- `bump`: patch/minor/major
- `publish_npm`: 是否发布 npm
- `publish_pypi`: 是否发布 PyPI
- `create_release`: 是否创建 GitHub Release
- `dry_run`: 仅演练（跳过 publish/tag/release，默认开启）

流程：

1. 安装依赖并做版本一致性预检查。
2. 根据 bump 计算新版本。
3. 同步更新 npm 与 Python SDK 版本。
4. 构建并校验 Python 分发包。
5. 若 `dry_run=false`：发布 npm（NPM_TOKEN）。
6. 若 `dry_run=false`：发布 PyPI（PYPI_TOKEN）。
7. 若 `dry_run=false`：提交版本变更、打 tag（`sdk-vX.Y.Z`）、push。
8. 若 `dry_run=false` 且 `create_release=true`：创建 GitHub Release。

## 四、PR 检查流程说明（pr-checks.yml）

触发方式：

- `pull_request`
- `workflow_dispatch`（手动测试流水线）

作业：

1. `tests`
   - 安装依赖
   - lint
   - SDK 版本一致性检查
   - 运行非 E2E tests（apps/packages，排除 desktop Playwright）
   - 运行 root `pnpm test`
2. `e2e`
   - `docker compose -f docker-compose.e2e.yml up --build ...`
   - 上传截图与 Playwright 报告 artifact
3. `report`
   - 汇总 tests/e2e 状态
   - 将截图文件清单写入 PR comment（sticky 更新）
   - 附上本次 run 链接，便于下载完整截图

## 五、你需要人工配置的地方（逐条执行）

### 必做：仓库设置

1. 打开仓库 `Settings -> Actions -> General`
2. Workflow permissions 设为 **Read and write permissions**（发布流需要 push/tag）
3. 勾选允许 Actions 创建和批准 PR（如你有相关策略）

### 必做：配置 npm token

1. 在 npm 创建可发布 `@shadowob/sdk` 的 access token
2. 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions`
3. 新建 secret：`NPM_TOKEN`

### 必做：配置 PyPI token

1. 在 PyPI 创建项目 `shadowob-sdk` 的 API Token
2. 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions`
3. 新建 secret：`PYPI_TOKEN`

### 建议：分支保护

建议 main 分支开启：

- 必须通过 `pr-checks / Unit/Integration tests`
- 必须通过 `pr-checks / E2E via docker-compose`

## 六、如何测试流水线（推荐顺序）

1. 提交一个 PR（哪怕是文档小改动）
2. 观察 `pr-checks`：
   - tests 与 e2e 是否均执行
   - PR 是否收到 sticky comment
   - artifact 是否包含截图与 playwright 报告
3. 手动触发 `publish-packages`：
   - 第一次保持 `dry_run=true`（仅验证流程可跑）
   - 确认后改为 `dry_run=false` 再执行正式发布
4. 检查发布结果：
   - npm 包版本
   - PyPI 包版本
   - Git tag `sdk-vX.Y.Z`
   - GitHub Release 是否生成

## 七、注意事项

- 当前截图在 PR 评论中以“截图清单 + run 链接”的形式回传；完整图片在 artifact 中下载查看。
- 若你希望“评论内直接显示图片”，需要引入可公网访问的图床或额外上传策略（GitHub artifact 本身不直接提供稳定匿名图片链接）。
