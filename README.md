# 香菜 · 运行状态

香菜机器人的 AI 请求状态页。React + TypeScript + Vite 前端，Node.js + Express 服务端代理。

## 启动

需要 Node.js 22.12+（推荐 24 LTS）。首次运行：

```powershell
npm install
Copy-Item .env.example .env
```

编辑 `.env`，填入服务端使用的 `BOT_API_KEY`。如果已有配置好的 `.env`，不要覆盖。

```powershell
npm run dev
```

打开 http://127.0.0.1:5173 。开发时代理服务默认使用 3001 端口。

## 生产运行

```powershell
npm run build
npm start
```

打开 http://127.0.0.1:3001 。服务端同时提供静态页面和 `/api/status`，必须部署 Node 服务，不能只上传 `dist` 到纯静态托管。

部署机器需能够访问 `192.168.31.126:5332`。局域网访问时将 `.env` 中 `HOST` 改为 `0.0.0.0`；生产域名可通过 Caddy / Nginx 反向代理并启用 HTTPS。

| 环境变量 | 用途 | 默认值 |
| --- | --- | --- |
| `BOT_API_BASE_URL` | 上游接口地址，仅服务端读取 | `http://192.168.31.126:5332` |
| `BOT_API_KEY` | 上游 Bearer Key，仅服务端读取 | 必填 |
| `BOT_MODEL` | 香菜使用的模型别名 | `xc` |
| `HOST` | 服务监听地址 | `127.0.0.1` |
| `PORT` | 服务端口 | `3001` |
| `GUOBA_BASE_URL` | 锅巴面板地址，包含挂载路径 | 示例：`http://192.168.31.126:2536/guoba` |
| `GUOBA_ACCOUNT` | 锅巴登录账号，仅服务端读取 | 留空时不连接 |
| `GUOBA_PASSWORD` | 锅巴登录密码，仅服务端读取 | 留空时不连接 |
| `DOCKER_PORT` | Compose 发布到宿主机的端口 | `3001` |
| `DOCKER_BIND_ADDRESS` | Compose 在宿主机的监听地址 | `0.0.0.0` |

## 锅巴账号面板

在 `.env` 中填写 `GUOBA_ACCOUNT`、`GUOBA_PASSWORD` 和可访问的 `GUOBA_BASE_URL`，然后重启状态页的 Node 服务。地址填写到 `/guoba` 即可，不要加 `/#/account` 或 `/api`。密码包含 `$`、`#`、空格时用单引号包裹，例如 `GUOBA_PASSWORD='your$password#here'`，以兼容 Node dotenv 和 Docker Compose。现有 AI Key 配置无需修改。

根据 `G:\Yunzai\plugins\guoba-plugin` 源码，当前版本的鉴权流程为：

1. 服务端 POST `/guoba/api/login/account-password`，JSON 请求体为 `{ account, password }`。
2. 从 `{ ok: true, code: 0, result: { token } }` 读取登录 Token，后续通过 `guoba-access-token` 请求头 GET `/guoba/api/bot/online-list`。
3. 插件使用 Redis 保存 24 小时会话；提前 60 秒刷新。JWT 带有更早 `exp` 时使用更早的截止时间。
4. 遇到 HTTP 401 或业务码 401，清除旧会话、重新登录并重试一次。再次失败即停止；403 权限问题不重登。失败后冷却 60 秒，避免错误密码或服务异常导致反复登录。

这版插件主要使用 Token 而非 Cookie 鉴权。适配器也支持 `Set-Cookie`：通过服务端 CookieJar 管理路径、到期与轮换；Cookie-only 会话按 Cookie 有效期提前重登。登录 Token、Cookie 和密码仅在服务端内存 / 环境变量中使用，不转发给浏览器、不写入日志。上游重定向被禁止。

浏览器独立请求同源 `/api/accounts`，展示昵称、状态、平台、版本、运行时长、消息与联系人数量。UIN 在服务端脱敏，例如 `123456789` → `12****89`；昵称、版本等文本中回显的 UIN 也会替换。返回的卡片 ID 使用服务端随机密钥生成。

`OneBotv11` / `ICQQ` / `QQBot` 适配器支持头像，其他适配器使用默认图标。前端只收到 `/api/accounts/<随机账号标识>/avatar`，原始 UIN 和头像 URL 保存在服务端内存。代理使用已登录账号列表中登记的地址，校验 QQ 头像域名和 UIN，不接受浏览器传入的 URL。QQBot 使用腾讯 `thirdqq.qlogo.cn` 的签名头像地址：仅服务端保留签名参数，并将该端点升级为 HTTPS；沙盒账号未提供头像时使用默认图标。图片请求不携带锅巴 Cookie / Token；重定向只允许 QQ 头像 CDN，且不会透传响应头或上游地址。成功图片在服务端缓存一小时，浏览器使用剩余缓存时间；并发请求合并，失败冷却一分钟。支持 PNG / JPEG / GIF / WebP，限制 2 MB 和请求超时；加载失败回退到默认图标。

账号面板每 30 秒刷新，跟随页面的暂停 / 全局刷新控制，也可独立刷新。账号快照不受 AI 时间范围筛选影响，账号接口故障不阻塞 AI 日志。未配置时展示待接入状态，不发送登录请求；读取成功但列表为空时展示暂无账号。成功响应缓存 10 秒，并发访问共享整个登录 / 重试流程。

该 Yunzai 配置启用了 TRSS 共用服务，端口为 2536，挂载路径为 `/guoba`。已确认 `192.168.31.126:2536` 的账号接口返回预期的未登录响应。如果状态页部署到其他机器或 Docker，请将地址改为能够访问 Yunzai 的主机地址；容器内的 `127.0.0.1` 指向容器自身。

## 数据与交互

- 每 30 秒自动刷新；支持暂停与手动刷新，页面在后台时不轮询。
- 可切换 1 小时、6 小时、24 小时、3 天和 7 天，以及接口返回的模型分组。
- 成功率、平均响应耗时和生成速度直接使用所选分组的接口统计。
- 图表展示 `groups[].series` 的真实采样点，不生成演示数据，不插入没有请求的零值。首字耗时为 0 / 负数视为未测得。
- Token 用量和请求数只统计日志接口此次返回记录中，匹配模型、分组及所选时间范围的请求，不代表完整历史总量。
- 日志支持模型 / 编号搜索、状态筛选、分页和详情复制。`type=2` 为消费请求，`type=5` 为失败请求；充值等账单记录不计入。
- 单个接口异常时，另一部分继续展示；全部异常显示重试提示，不伪装成正常运行。状态依据模型请求统计，不是机器人进程心跳。
- 时间按访问者浏览器的本地时区展示。

## 密钥隔离

浏览器仅请求同源 `/api/status?hours=24`、`/api/accounts` 及账号头像代理。服务端读取 `.env` 并为 AI / 锅巴接口附加各自的鉴权信息；头像请求不携带这些凭据，凭据不会写入前端源码、Vite 环境变量或构建产物。

`.env` 已被 Git 和 Docker 构建忽略。对外响应采用字段白名单，不转发原始响应、用户名、IP、用户 ID、Token 名称、计费字段或原始错误正文，并额外过滤可能意外回显的密钥。代理禁止跟随重定向，带请求超时、10 秒缓存和并发合并。服务端只托管 `dist`，不会暴露项目文件。

这是可公开读取的状态页；能访问页面的人可以查看经过筛选的请求元数据。如果只供内部使用，请在反向代理处配置访问认证。

## Docker 部署

需要 Docker Engine 20.10+ 和 Docker Compose v2，使用 Linux 容器。宿主机无需安装 Node.js。首次部署时，从 `.env.example` 复制一份 `.env`；已有 `.env` 时直接使用，**不要覆盖已有密钥**。

```sh
# Linux / macOS，且仅在 .env 不存在时执行
cp .env.example .env
```

Windows 使用 `Copy-Item .env.example .env`。填写 `.env` 中的 AI Key、锅巴账号密码及可访问的上游地址，然后在项目目录执行：

```sh
docker compose up -d --build
docker compose ps
```

浏览器打开 `http://服务器IP:3001`，本机访问 http://127.0.0.1:3001 。服务的健康状态应变为 `healthy`。若本地开发服务已占用 3001，在 `.env` 中设置 `DOCKER_PORT=3002` 后重新执行启动命令，通过 3002 端口访问。

Compose 固定容器内部 `HOST=0.0.0.0`、`PORT=3001`，因此现有开发环境的 `HOST=127.0.0.1` 不影响容器访问。对外端口由 `DOCKER_PORT` 控制。仅供本机 Nginx / Caddy 反向代理时，可设置 `DOCKER_BIND_ADDRESS=127.0.0.1`。

配置通过运行时 `env_file` 传入，`.env` 不参与镜像构建，也不会进入前端文件。含 `$`、`#` 的密码请使用单引号包裹。请勿把 `docker compose config` 的完整输出发到公开位置，其中可能包含展开后的环境变量；只检查配置可运行 `docker compose config --quiet`。

**容器访问上游：**当前 `192.168.31.126:5332` 与 `192.168.31.126:2536/guoba` 可直接保留，前提是部署主机能到达该局域网。上游在 Docker 宿主机时，也可使用 `host.docker.internal`（Compose 已配置 Linux 所需的 host-gateway）；上游服务须监听容器能够访问的网卡。不要在容器配置中用 `127.0.0.1` 表示宿主机。

常用维护命令：

```sh
# 查看最近日志
docker compose logs --tail=100 -f

# 更新项目代码后重新构建并启动
docker compose up -d --build

# 修改 .env 后重建容器以载入新配置；仅 restart 不会更新环境变量
docker compose up -d --force-recreate

# 停止并移除容器
docker compose down
```

镜像使用多阶段构建，最终阶段只保留生产依赖、前端产物及服务端代码，以非 root 用户运行。Compose 启用只读文件系统、日志轮转、`unless-stopped` 重启策略及 30 秒退出宽限。登录会话与一小时头像缓存保存在内存，容器重建后会重新登录、重新获取，无需挂载数据卷。

`/api/health` 只检查状态页服务是否能够响应，不调用 AI 或锅巴接口，也不要求填写密钥。因此上游故障会显示在页面中，不会使状态页容器被误判为不可用。Docker 每 30 秒执行一次健康检查；重启策略会在进程退出时重启，单纯 `unhealthy` 不会自动重启容器。

不使用 Compose 时，可构建镜像后通过挂载配置文件运行，保留 dotenv 对单引号与特殊字符的解析：

```sh
docker build -t xiangcai-status:local .
docker run -d --name xiangcai-status --restart unless-stopped --init --mount type=bind,source=/absolute/path/to/.env,target=/app/.env,readonly -p 3001:3001 xiangcai-status:local
```

把 `/absolute/path/to/.env` 换成实际绝对路径，并确保配置文件对容器内的 `node` 用户可读。

## 检查

```powershell
npm test
npm run build
```

测试覆盖真实响应结构转换、敏感字段过滤、密钥回显、UIN 脱敏、登录 Token / Cookie 隔离、过期重登、重试上限、失败冷却、错误处理、代理路径限制、配置缺失、缓存及并发合并。头像测试覆盖适配器筛选、一小时缓存及到期刷新、上游请求合并、图片格式 / 大小限制和重定向校验；已使用实际锅巴登录及 ICQQ / OneBotv11 / QQBot 头像验证代理，重复请求未产生额外图片下载。
