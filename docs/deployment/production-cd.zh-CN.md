# 生产 CD 与迁移 Runbook

## 发布与部署链路

`main` 合入后的链路是：

1. `post-merge-validation` 跑完整测试和构建验证。
2. `publish-prod-images` 在上一步成功后发布主应用镜像。
3. `deploy-production` 在镜像发布成功后自动部署主应用到生产服务器。

自动部署使用不可变镜像 tag：`sha-<12 位 commit sha>`。手动部署从 GitHub Actions 的 `deploy-production` workflow 触发，`image_tag` 默认是 `latest`。当前生产服务器只部署 `server`、`web`、`admin` 主应用栈，不部署 integrations。

轻量 integrations 的中期形态是单独的 `shadow-integrations` 聚合 runtime；`flash` 和 `space` 因数据库/状态依赖保留独立镜像。`publish-integrations-runtime` 成功后会触发 `publish-integration-images` 自动发布 `flash`/`space`，随后触发 `deploy-integrations-production` 一次性部署 `integrations-runtime`、`flash`、`space`。这条链路独立于主应用 `deploy-production`，避免 integrations 故障阻塞主站 CD。需要手动部署时，触发 `deploy-integrations-production` 并选择 `image_tag`。

## GitHub Environment 配置

在 GitHub 的 `ShadowOB Production` environment 中配置：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `PROD_SSH_HOST` | Secret | 必填。生产服务器地址，不要提交到代码库，也不要放在普通 variable。 |
| `PROD_SSH_PRIVATE_KEY` | Secret | 推荐。可登录生产服务器的私钥内容。 |
| `PROD_SSH_PASSWORD` | Secret | 可选。没有私钥时使用密码登录，workflow 会安装 `sshpass`。 |
| `PROD_SSH_KNOWN_HOSTS` | Secret | 可选。建议放 `ssh-keyscan "$PROD_SSH_HOST"` 的结果；服务器重置系统后必须更新或删除这个 secret，否则旧 host key 缓存会导致 SSH 校验失败。 |
| `PROD_SSH_USER` | Variable | 可选，默认 `root`。 |
| `PROD_SSH_PORT` | Variable | 可选，默认 `22`。 |
| `PROD_REMOTE_PATH` | Variable | 可选，默认 `/workspace/shadow`。 |
| `PROD_IMAGE_REGISTRY` | Variable | 可选，默认 `ghcr.io`。 |
| `PROD_IMAGE_NAMESPACE` | Variable | 可选，默认仓库 owner 的小写值。 |

生产业务密钥仍保留在服务器 `/workspace/shadow/.env`，不要放进仓库。部署脚本只会维护镜像相关变量：

```dotenv
SHADOW_IMAGE_REGISTRY=ghcr.io
SHADOW_IMAGE_NAMESPACE=buggyblues
SHADOW_IMAGE_TAG=sha-0123456789ab
```

如果 GHCR package 是 private，先在服务器登录一次：

```bash
docker login ghcr.io
```

## 服务器前置条件

目标服务器需要：

- Docker Engine 与 Docker Compose v2，或兼容的 `docker-compose`。
- `/workspace/shadow/.env` 存在，并包含 `docker-compose.prod.yml` 需要的生产变量。

手动在本地触发同一套部署脚本：

```bash
scripts/ops/deploy-prod.sh \
  --host "$PROD_SSH_HOST" \
  --user root \
  --remote-path /workspace/shadow \
  --image-tag latest
```

部署脚本会上传最新 compose 文件，然后执行：

```bash
docker compose --env-file .env -f docker-compose.prod.yml pull server web admin
docker compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans --no-build
docker image prune -f
```

生产服务器禁止构建镜像。生产 compose 文件不能包含 `build:`，生产部署和迁移脚本只允许拉取已经发布的镜像并用 `--no-build` 重启容器。

## 从旧服务器迁移数据

迁移脚本通过参数或环境变量读取源服务器和目标服务器地址。不要把真实 IP 提交到代码库。

一次完整同步：

```bash
scripts/ops/migrate-prod-data.sh sync \
  --source "$SOURCE_SSH_TARGET" \
  --target "$TARGET_SSH_TARGET" \
  --yes
```

这个命令会：

- 拉取旧服务器 `/workspace/shadow/.env` 到本地备份目录。
- 用 `pg_dump -Fc` 备份主 Postgres。
- 自动识别并打包源服务器 `minio` 容器挂载的 MinIO volume。
- 备份并恢复 `.env` 中引用的 cloud runtime host 文件，例如 `KUBECONFIG_HOST_PATH`、`CLOUD_SAAS_CLUSTER_CONFIG_HOST_PATH` 和 `CLOUD_SAAS_CLUSTER_KUBECONFIG_HOST_PATH`。
- 上传备份到新服务器 `/workspace/shadow/.migration-backups/<timestamp>`。
- 覆盖新服务器 `.env`、Postgres 数据和 MinIO 数据。
- 重新启动目标服务器的生产 compose。

脚本会优先从远端正在运行的 `minio` 容器挂载中识别实际 volume 名称。如果容器未运行，才回退到 `.env` 的 `SHADOW_MINIO_VOLUME` 或默认值。如果需要覆盖自动识别结果，显式传入：

```bash
scripts/ops/migrate-prod-data.sh sync \
  --source "$SOURCE_SSH_TARGET" \
  --target "$TARGET_SSH_TARGET" \
  --source-minio-volume old_shadow_miniodata \
  --target-minio-volume shadow_miniodata \
  --yes
```

只通过 SSH dump 主 Postgres 和 MinIO 到本地，不迁移 `.env`、不恢复：

```bash
scripts/ops/dump-prod-data.sh \
  --source "$SOURCE_SSH_TARGET" \
  --remote-path /workspace/shadow
```

只备份不恢复：

```bash
scripts/ops/migrate-prod-data.sh backup --source "$SOURCE_SSH_TARGET"
```

从已有本地备份恢复：

```bash
scripts/ops/migrate-prod-data.sh restore \
  --target "$TARGET_SSH_TARGET" \
  --backup-dir .tmp/prod-migrations/20260608T120000Z \
  --yes
```

迁移可以重复执行。每次恢复都会覆盖目标服务器的主 Postgres 和 MinIO 数据；最终切流前，先停止旧服务器写入或进入维护窗口，再执行最后一次 `sync`。

## Integrations Runtime

聚合 runtime 包含：

- `kanban`
- `qna`
- `quiz`
- `trainer`
- `skills`
- `warbuddy`

`flash` 和 `space` 仍保留为单独服务，不打进聚合 runtime；生产部署会和 runtime 使用同一个 `sha-<12 位 commit sha>` tag 一起拉取并启动。生产 compose 默认不启动旧的独立轻量 app 容器。

手动发布 runtime 镜像：

```bash
gh workflow run publish-integrations-runtime.yml -f tag=latest
```

手动发布独立 integration 镜像（例如 `flash` 或 `space`）。需要部署时建议发布 `all`，确保 flash 和 space 都有同一个 tag：

```bash
gh workflow run publish-integration-images.yml -f image=all -f tag=latest
```

手动部署已发布 runtime、flash、space 镜像：

```bash
gh workflow run deploy-integrations-production.yml -f image_tag=latest
```

部署前在目标机器的 integrations 环境文件中配置每个 app 的域名和 base URL：

```dotenv
SHADOW_INTEGRATIONS_RUNTIME_IMAGE_TAG=latest
SHADOW_LEGACY_INTEGRATIONS_IMAGE_TAG=latest
INTEGRATIONS_RUNTIME_PORT=4200
INTEGRATIONS_SHADOW_SERVER_URL=https://shadowob.com
INTEGRATIONS_SHADOW_WEB_BASE_URL=https://shadowob.com

KANBAN_HOSTS=kanban.example.com
KANBAN_PUBLIC_BASE_URL=https://kanban.example.com
KANBAN_API_BASE_URL=https://kanban.example.com
```

每个轻量 app 都使用同样的 `*_HOSTS`、`*_PUBLIC_BASE_URL`、`*_API_BASE_URL` 配置形态。`SHADOW_INTEGRATIONS_RUNTIME_IMAGE_TAG` 只控制合并后的 runtime 镜像；`SHADOW_LEGACY_INTEGRATIONS_IMAGE_TAG` 控制 flash、space 和 legacy 单体镜像，避免 runtime 发布标签污染独立应用。`INTEGRATIONS_SHADOW_SERVER_URL` 和 `INTEGRATIONS_SHADOW_WEB_BASE_URL` 是 integrations runtime 专用覆盖项，避免复用主应用容器内部的 `SHADOW_SERVER_URL`。真实 IP、密钥、Token 和机器地址只放在 GitHub Secrets、目标机器 `.env` 或本地 shell env，不能提交到仓库。

Nginx 配置要点：

- WebSocket：转发 `Upgrade` 和 `Connection` 头，`warbuddy` 的 `/api/live/rooms/*` 需要长连接。
- 上传限制：Q&A 图片和 Skills package 上传需要设置合理的 `client_max_body_size`。
- SPA cache：`/shadow/server` 和 HTML shell 不缓存，hashed `/assets/*` 可以长缓存。
- 路由：生产推荐按 Host 分发到同一个 runtime 端口；runtime 的 `/<slug>/...` 前缀转发只作为调试兜底。

生产服务器仍禁止构建镜像。只允许拉取 GitHub Actions 已发布的 `shadow-integrations:<tag>`、`shadow-integration-flash:<tag>`、`shadow-integration-space:<tag>`，再用 `docker compose up -d --no-build` 启动。

## 回滚

主应用回滚：

```bash
scripts/ops/deploy-prod.sh \
  --host "$PROD_SSH_HOST" \
  --image-tag sha-上一版12位sha
```
