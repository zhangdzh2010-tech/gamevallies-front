#!/usr/bin/env python3
"""
前端 H5 部署脚本 — 火山引擎函数服务（容器镜像）

流程: docker build → docker push → UpdateFunction(image) → 等待缓存 → Release

用法:
  source .env.deploy && python3 scripts/deploy.py

所需环境变量（见 .env.deploy）:
  VOLCENGINE_ACCESS_KEY, VOLCENGINE_SECRET_KEY
  VOLCENGINE_REGISTRY_USERNAME, VOLCENGINE_REGISTRY_PASSWORD
"""

import os
import shutil
import sys
import time
import subprocess
import warnings
warnings.filterwarnings("ignore")

import volcenginesdkvefaas
import volcenginesdkcore

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT_DIR, "dist", "h5")

# 前端函数信息（见 DEPLOY_RUNBOOK.md §1.1）
FUNC_NAME = "gv-frontend"
FUNC_ID   = "tsrtwmbw"
PORT      = 8080

AK                = os.environ.get("VOLCENGINE_ACCESS_KEY",         "")
SK                = os.environ.get("VOLCENGINE_SECRET_KEY",         "")
REGION            = os.environ.get("VOLCENGINE_REGION",             "cn-shanghai")
REGISTRY          = os.environ.get("VOLCENGINE_REGISTRY",           "gamevallies-repo-cn-shanghai.cr.volces.com")
NAMESPACE         = os.environ.get("VOLCENGINE_REGISTRY_NAMESPACE", "gamevallies")
IMAGE_TAG         = os.environ.get("IMAGE_TAG",                     "latest")
VCR_USERNAME      = os.environ.get("VOLCENGINE_REGISTRY_USERNAME",  "")
VCR_PASSWORD      = os.environ.get("VOLCENGINE_REGISTRY_PASSWORD",  "")
VPC_ID            = os.environ.get("VOLCENGINE_VPC_ID",             "")
SUBNET_ID         = os.environ.get("VOLCENGINE_SUBNET_ID",          "")
SECURITY_GROUP_ID = os.environ.get("VOLCENGINE_SECURITY_GROUP_ID",  "")


def shell(cmd: list) -> bool:
    result = subprocess.run(cmd, cwd=ROOT_DIR)
    return result.returncode == 0


def sync_root_txt_assets():
    if not os.path.isdir(DIST_DIR):
        print(f"❌ 缺少 H5 构建产物: {DIST_DIR}")
        print("   请先执行 npm run build:h5")
        sys.exit(1)

    txt_files = [
        name for name in os.listdir(ROOT_DIR)
        if name.lower().endswith(".txt") and os.path.isfile(os.path.join(ROOT_DIR, name))
    ]
    if not txt_files:
        return

    print("\n🗂️ 同步站点根目录校验文件...")
    for name in txt_files:
        src = os.path.join(ROOT_DIR, name)
        dst = os.path.join(DIST_DIR, name)
        shutil.copy2(src, dst)
        print(f"   已同步: {name}")


def get_api():
    cfg = volcenginesdkcore.Configuration()
    cfg.ak, cfg.sk, cfg.region = AK, SK, REGION
    return volcenginesdkvefaas.VEFAASApi(volcenginesdkcore.ApiClient(cfg))


def main():
    if not AK or not SK:
        print("❌ 请设置 VOLCENGINE_ACCESS_KEY 和 VOLCENGINE_SECRET_KEY")
        sys.exit(1)
    if not VCR_USERNAME or not VCR_PASSWORD:
        print("❌ 请设置 VOLCENGINE_REGISTRY_USERNAME 和 VOLCENGINE_REGISTRY_PASSWORD")
        sys.exit(1)

    image = f"{REGISTRY}/{NAMESPACE}/{FUNC_NAME}:{IMAGE_TAG}"

    print(f"📍 部署配置:")
    print(f"   函数名:   {FUNC_NAME} (ID: {FUNC_ID})")
    print(f"   地域:     {REGION}")
    print(f"   镜像:     {image}")
    print(f"   VPC ID:   {VPC_ID or '未设置'}")
    print(f"   Subnet:   {SUBNET_ID or '未设置'}")
    print(f"   SecGroup: {SECURITY_GROUP_ID or '未设置'}")

    sync_root_txt_assets()

    # 1. docker login
    # VCR 用户名含 '#'，通过 stdin 传密码避免 shell 解析问题（见 DEPLOY_RUNBOOK §6.1）
    print("\n🔐 登录 VCR...")
    login = subprocess.run(
        ["docker", "login", REGISTRY, "-u", VCR_USERNAME, "--password-stdin"],
        input=VCR_PASSWORD.encode(),
        cwd=ROOT_DIR,
    )
    if login.returncode != 0:
        print("❌ docker login 失败")
        sys.exit(1)
    print("✅ 登录成功")

    # 2. docker build
    print(f"\n🔨 构建镜像: {image}")
    if not shell(["docker", "build", "--platform", "linux/amd64", "-t", image, "."]):
        print("❌ docker build 失败")
        sys.exit(1)
    print("✅ 构建成功")

    # 3. docker push
    print(f"\n⬆️  推送镜像到 VCR...")
    if not shell(["docker", "push", image]):
        print("❌ docker push 失败")
        sys.exit(1)
    print("✅ 推送成功")

    # 4. UpdateFunction
    api = get_api()
    print(f"\n🔄 更新函数 {FUNC_NAME} (ID: {FUNC_ID})...")
    try:
        update_req = volcenginesdkvefaas.UpdateFunctionRequest(
            id=FUNC_ID,
            source_type="image",
            source=image,
            source_access_config=volcenginesdkvefaas.SourceAccessConfigForUpdateFunctionInput(
                username=VCR_USERNAME,
                password=VCR_PASSWORD,
            ),
        )
        if VPC_ID and SUBNET_ID and SECURITY_GROUP_ID:
            update_req.vpc_config = volcenginesdkvefaas.VpcConfigForUpdateFunctionInput(
                enable_vpc=True,
                vpc_id=VPC_ID,
                subnet_ids=[SUBNET_ID],
                security_group_ids=[SECURITY_GROUP_ID],
            )
        api.update_function(update_req)
        print("✅ 函数配置已更新")
    except Exception as e:
        print(f"❌ 更新函数失败: {e}")
        sys.exit(1)

    # 5. 等待镜像缓存就绪（见 DEPLOY_RUNBOOK §6.6）
    print(f"\n⏳ 等待镜像缓存就绪（最多 5 分钟）...")
    deadline = time.time() + 300
    cache_status = status = ""
    while time.time() < deadline:
        try:
            sync = api.get_image_sync_status(
                volcenginesdkvefaas.GetImageSyncStatusRequest(function_id=FUNC_ID, source=image)
            )
            status       = getattr(sync, "status", "") or ""
            cache_status = getattr(sync, "image_cache_status", "") or ""
            if cache_status.lower() == "ready" or status.lower() == "succeeded":
                print(f"✅ 镜像缓存就绪 (status={status})")
                break
            if status.lower() == "failed":
                print(f"❌ 镜像同步失败，请检查 VCR 凭证")
                sys.exit(1)
        except Exception as e:
            print(f"  查询异常: {e}")
        print(f"  等待中... status={status} cache={cache_status}")
        time.sleep(10)
    else:
        print("❌ 等待超时（5 分钟），请到控制台确认镜像状态")
        sys.exit(1)

    # 6. Release
    print(f"\n🚀 发布新版本...")
    try:
        rel = api.release(volcenginesdkvefaas.ReleaseRequest(function_id=FUNC_ID, revision_number=0))
        print(f"✅ 发布成功（版本号: {rel.new_revision_number}，状态: {rel.status}）")
    except Exception as e:
        print(f"❌ 发布失败: {e}")
        sys.exit(1)

    print(f"\n🎉 前端部署完成！")


if __name__ == "__main__":
    main()
