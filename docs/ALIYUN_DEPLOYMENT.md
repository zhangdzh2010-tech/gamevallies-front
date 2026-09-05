# 阿里云前端发布

前端构建为 Nginx 容器，推送 ACR，由 ECS 上标签为 `aliyun-ecs-front` 的专用 Runner 部署。镜像按 Git commit SHA 标记，容器通过 HTTP 检查才记录为当前版本，失败时恢复前一个版本。入口为 `.github/workflows/deploy.yml`；未设 `ALIYUN_DEPLOY_ENABLED=true` 时不会发布。

先按[后端阿里云部署说明](https://github.com/zhangdzh2010-tech/gamevallies-backend/blob/main/docs/deployment/ALIYUN_DEPLOYMENT.md)准备 ACR、同一台 Linux x86_64 ECS、Docker Compose、专用 Runner、ALB、共享网络和 Secrets。本仓库的目标目录为 `/opt/gamevallies/front`，Compose project 为 `gamevallies-front`。前端容器不直接暴露主机端口，由后端 gateway 转发。

两个仓库均需 repository Variables：`ALIYUN_DEPLOY_ENABLED`、`ACR_REGISTRY`、`ACR_NAMESPACE`；repository Secrets：`ACR_USERNAME`、`ACR_PASSWORD`（构建推送），`ACR_PULL_USERNAME`、`ACR_PULL_PASSWORD`（仅拉取）。创建 production Environment，部署限制为 main。

前端追加以下公开构建变量，不能填写任何服务端密钥：

| Variable | 用途 |
| --- | --- |
| `PUBLIC_ORIGIN` | 应用 HTTPS origin，同时作为各业务 API 地址；ALB 转发后端 8080 |
| `GAME_CONTENT_ORIGIN` | 独立的游戏内容 HTTPS origin；ALB 转发后端 8082 |
| `GAME_SHELL_ORIGIN` | 可选，游戏外壳应用 origin，默认 PUBLIC_ORIGIN |
| `TARO_APP_ENABLE_WECHAT_H5_LOGIN` | 可选，启用公众号登录时设为 true |
| `TARO_APP_WECHAT_OAUTH_APP_ID` | 可选，公众号的公开 App ID |
| `TARO_APP_WECHAT_OAUTH_SCOPE` | 可选，OAuth scope |

Origin 不带结尾 `/` 或路径。上述值编译进 H5；改变后须重新构建发布。WebSocket 使用 PUBLIC_ORIGIN 对应的 `/ws` 命名空间，后端 gateway 负责 `/ws/socket.io/` 转发。

首次先部署后端，再部署前端，两者健康且经过登录、作品创建/播放、SSE/WebSocket 检查后再切换生产域名。应用健康检查通过不等于真实业务验证通过。ECS/ACR/Runner/域名和凭据需要实际配置，本仓库提交不会创建云资源。

维护使用 `/opt/gamevallies/front/current/compose.yml` 和 `images.env`：

```bash
unset IMAGE_PREFIX IMAGE_TAG RUNTIME_ENV_FILE GATEWAY_BIND
docker compose -p gamevallies-front --env-file /opt/gamevallies/front/current/images.env -f /opt/gamevallies/front/current/compose.yml ps
```

回滚步骤与后端相同，将目标目录改为 `/opt/gamevallies/front`、project 改为 `gamevallies-front`。保留已验证发布目录和对应 ACR 镜像。不要自动清理仍可能用于回滚的标签。线上业务验证脚本仍可用，其本地环境文件入口已改为 `.env.production`。
