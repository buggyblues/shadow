# 生产 CD 与迁移 Runbook

## 发布与部署链路

`main` 合入后的链路是：

1. `post-merge-validation` 跑完整测试和构建验证。
2. `publish-prod-images` 在上一步成功后发布主应用和 integrations 镜像。
3. `deploy-production` 在镜像发布成功后自动部署到生产服务器。

自动部署使用不可变镜像 tag：`sha-<12 位 commit sha>`。手动部署从 GitHub Actions 的 `deploy-production` workflow 触发，`image_tag` 默认是 `latest`，`integrations_image_tag` 为空时复用 `image_tag`。

## GitHub Environment 配置

在 GitHub 的 `ShadowOB Production` environment 中配置：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `PROD_SSH_HOST` | Secret | 必填。生产服务器地址，不要提交到代码库，也不要放在普通 variable。 |
| `PROD_SSH_PRIVATE_KEY` | Secret | 推荐。可登录生产服务器的私钥内容。 |
| `PROD_SSH_PASSWORD` | Secret | 可选。没有私钥时使用密码登录，workflow 会安装 `sshpass`。 |
| `PROD_SSH_KNOWN_HOSTS` | Secret | 可选。建议放 `ssh-keyscan "$PROD_SSH_HOST"` 的结果。 |
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
SHADOW_INTEGRATIONS_IMAGE_TAG=sha-0123456789ab
```

如果 GHCR package 是 private，先在服务器登录一次：

```bash
docker login ghcr.io
```

## 服务器前置条件

目标服务器需要：

- Docker Engine 与 Docker Compose v2，或兼容的 `docker-compose`。
- `/workspace/shadow/.env` 存在，并包含 `docker-compose.prod.yml` 需要的生产变量。
- integrations 的公网地址变量在 `.env` 中配置，例如 `KANBAN_PUBLIC_BASE_URL`、`FLASH_PUBLIC_BASE_URL`、`SPACE_PUBLIC_BASE_URL`。

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
docker compose --env-file .env -f integrations/docker-compose.prod.yaml pull kanban skills qna quiz trainer resume flash space warbuddy
docker compose --env-file .env -f integrations/docker-compose.prod.yaml up -d --remove-orphans --no-build
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

## 回滚

主应用回滚：

```bash
scripts/ops/deploy-prod.sh \
  --host "$PROD_SSH_HOST" \
  --image-tag sha-上一版12位sha \
  --skip-integrations
```

integrations 回滚：

```bash
scripts/ops/deploy-prod.sh \
  --host "$PROD_SSH_HOST" \
  --integrations-image-tag sha-上一版12位sha \
  --skip-app
```
