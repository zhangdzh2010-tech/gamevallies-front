# 阿里云函数计算 FC 前端发布

采用 FC 自定义容器承载 Nginx Web 静态页面，GitHub 托管 Runner 构建 linux/amd64 镜像并推送同账号同地域 ACR，再使用官方 FC 3.0 SDK 发布。无需 ECS、SSH、服务器 Runner 或 ALB。

通用配置与后台任务约束见[后端部署文档](https://github.com/zhangdzh2010-tech/gamevallies-backend/blob/feat/aliyun-fc-deployment-20260905/docs/deployment/ALIYUN_DEPLOYMENT.md)。前后端 FC 改造 PR 必须配套合并后才能启用。

## GitHub 配置

Repository Variables：`ALIYUN_FC_DEPLOY_ENABLED=true`（准备完成后启用）、`FC_ACCOUNT_ID`、`FC_REGION`、`FC_PREFIX`、`FC_EXECUTION_ROLE`、`ACR_REGISTRY`、`ACR_NAMESPACE`，企业版 ACR 按需增加 `ACR_INSTANCE_ID`。

Repository Secrets：`ACR_USERNAME`、`ACR_PASSWORD`、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`；临时身份可增加 `ALIBABA_CLOUD_SECURITY_TOKEN`。`FC_RUNTIME_JSON` 可使用 `deploy/fc/runtime.example.json` 的空运行配置，按需增加 SLS 日志配置；不要把后端运行密钥放入此前端函数。production Environment 限制 main 部署。

前端构建变量：`PUBLIC_ORIGIN`（最终应用 HTTPS origin）、`GAME_CONTENT_ORIGIN`（独立作品内容 HTTPS origin），可选 `GAME_SHELL_ORIGIN` 默认应用 origin。它们不带路径和结尾斜杠。微信构建变量仅在实际启用对应登录时配置；本次不新增移动 H5 产品。域名变量变更需要重新构建。

## 发布顺序

先部署 frontend 函数，取得工作流 `fc-release-<SHA>` 工件中的函数 URL，并将其填入后端 `FC_FRONTEND_URL`。随后部署后端内部服务、gateway、content，在 FC 控制台绑定最终应用和作品内容域名并配置 HTTPS/DNS。

`deploy/fc/functions.json` 定义函数资源，`scripts/fc/deploy.py` 负责创建/更新、获取触发器地址、状态/HTTP 健康检查和版本回滚。原 ECS 开关、Compose 和 SSH 发布入口已移除。发布检查不等于已完成真实账号登录、生成、发布、SSE/WebSocket 验收。

本地验证与回滚：

```bash
pip install -r scripts/fc/requirements.txt
python scripts/fc/deploy.py validate --runtime .fc-runtime.json
python scripts/fc/deploy.py rollback --runtime .fc-runtime.json --release fc-release.json
```

需配置工作流同名环境变量，`IMAGE_TAG` 使用完整提交 SHA。回滚只恢复记录中的上一函数版本，不改数据库或 DNS；第一次发布没有旧版本。失败安装保留资源诊断，并阻止新实例启动。
