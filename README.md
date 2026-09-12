# 香菜 · 运行状态

香菜机器人的 AI 请求状态页。React + TypeScript + Vite 前端，Node.js + Express 服务端代理。

## 页面与目录

| 地址 | 内容 | 页面代码 |
| --- | --- | --- |
| `/` | 运行指标、模型表现和 Token 概况 | `src/pages/overview/` |
| `/accounts` | Bot 账号连接状态、消息和联系人统计 | `src/pages/accounts/` |
| `/requests` | 请求日志、筛选、分页和详情 | `src/pages/requests/` |
| `/statistics` | R 插件解析量、平台分布、趋势与媒体统计 | `src/pages/statistics/` |

各页面支持独立访问、刷新和浏览器前进 / 后退；原来的 `/#accounts`、`/#requests` 链接会跳转到对应页面。导航会标记当前页面，页面代码和样式按需加载。

公共导航和页脚位于 `src/components/layout/`，刷新与筛选控件位于 `src/components/status/`，共享状态位于 `src/state/`，数据请求和格式化工具分别位于 `src/hooks/`、`src/lib/`。`src/App.tsx` 只负责路由。

站内切换时保留自动刷新设置，以及 AI 统计时间范围和模型分组。账号页请求账号数据和群组统计，解析统计页只请求解析统计，离开后停止各自轮询；首页和日志页共用 AI 状态数据。Node 服务只为上述页面路径返回前端入口，未知页面、接口和文件仍返回 404。

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
| `RCONSOLE_BASE_URL` | Yunzai 的 HTTP 服务地址，可含反向代理前缀 | 未设置时使用 `GUOBA_BASE_URL` 的 origin；显式留空则禁用 |
| `EMO_BASE_URL` | 群组统计所在的 Yunzai HTTP 服务地址，可含反向代理前缀 | 未设置时使用 `GUOBA_BASE_URL` 的 origin；显式留空则禁用 |
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

账号页顶部汇总发送消息、接收消息和好友数量，排除 QQBot 沙盒账号；群组由下方独立统计区展示。消息和好友统计为各账号当前累计值相加，未去重；多个账号同时在同一群时，收发消息可能重复统计，导致数据虚高，页面会注明此限制。缺失的计数不冒充 0，部分缺失时标记已知数据合计与缺失账号数；尚未接入或读取失败时显示 `—`。

`OneBotv11` / `ICQQ` / `QQBot` 适配器支持头像，其他适配器使用默认图标。前端只收到 `/api/accounts/<随机账号标识>/avatar`，原始 UIN 和头像 URL 保存在服务端内存。代理使用已登录账号列表中登记的地址，校验 QQ 头像域名和 UIN，不接受浏览器传入的 URL。QQBot 使用腾讯 `thirdqq.qlogo.cn` 的签名头像地址：仅服务端保留签名参数，并将该端点升级为 HTTPS；沙盒账号未提供头像时使用默认图标。图片请求不携带锅巴 Cookie / Token；重定向只允许 QQ 头像 CDN，且不会透传响应头或上游地址。成功图片在服务端缓存一小时，浏览器使用剩余缓存时间；并发请求合并，失败冷却一分钟。支持 PNG / JPEG / GIF / WebP，限制 2 MB 和请求超时；加载失败回退到默认图标。

账号面板每 30 秒刷新，支持账号页的暂停与手动刷新控制。账号快照不受 AI 时间范围筛选影响，账号接口故障不阻塞 AI 日志。未配置时展示待接入状态，不发送登录请求；读取成功但列表为空时展示暂无账号。成功响应缓存 10 秒，并发访问共享整个登录 / 重试流程。

该 Yunzai 配置启用了 TRSS 共用服务，端口为 2536，挂载路径为 `/guoba`。已确认 `192.168.31.126:2536` 的账号接口返回预期的未登录响应。如果状态页部署到其他机器或 Docker，请将地址改为能够访问 Yunzai 的主机地址；容器内的 `127.0.0.1` 指向容器自身。

## 数据与交互

### 群组统计

账号页通过本站 `/api/group-stats` 读取 `emo.js` 的公开接口 `GET /api/emo/stats`。已有 `GUOBA_BASE_URL=http://192.168.31.126:2536/guoba` 时，自动连接 `http://192.168.31.126:2536/api/emo/stats`，无需新增配置或登录。不同主机或反向代理前缀可设置 `EMO_BASE_URL`（不含 `/api/emo/stats`）；显式设置 `EMO_BASE_URL=` 可禁用，配置变更后重启 Node 服务。

展示去重后群组数、按账号累加的群组数、重复计数，以及读取成功、协议分布和跳过的账号数。仅 OneBot / ICQQ 账号参与；去重后的群数直接使用上游按群号计算的 `uniqueGroups`，重复计数为 `totalGroups - uniqueGroups`，并非重复群的种类数。可展开各账号明细，查看脱敏账号、协议、群组数、新增覆盖群和读取状态。`uniqueGroupCount` 是按上游读取顺序新增覆盖的群数，不能理解为该账号独有的群；不凭脱敏号码与锅巴账号卡片强行匹配。

群组统计与账号页共用 30 秒自动刷新、暂停和手动刷新，离页停止请求；两路请求独立，故障互不阻塞。上游 `partial`、账号离线和使用缓存时会标记统计不完整或缓存提示；离线 / 读取失败账号的群数显示 `—`。底部展示上游 `updatedAt`，避免将读取缓存的时间误当成统计更新时间。

服务端只转发允许的计数、脱敏账号、固定协议 / 状态和更新时间，不转发原始群列表、上游消息或额外字段，也不携带 AI Key、锅巴 Token / Cookie。固定请求路径、禁止重定向，设有 12 秒超时、1 MB 响应上限、30 秒成功缓存、并发合并和 60 秒失败冷却；拒绝查询参数，错误或无效计数不会冒充正常的零群组。

### R 插件解析统计

适配 `rconsole-plugin` 提交 `22b3e853bba448534ef6ad5add703257fe9f142e`（2026-09-09）的免鉴权统计 API。上游服务复用 Yunzai 的监听端口，固定读取 `GET /rconsole/api/parse-stats/global` 的 JSON，不需要也不发送 AI Key、锅巴 Token 或 Cookie。

现有锅巴地址为 `http://192.168.31.126:2536/guoba` 时，无需新增配置，自动连接同一 origin 的统计 API。如果部署到不同主机或代理前缀下，在 `.env` 中设置 `RCONSOLE_BASE_URL`（例如 `http://192.168.31.126:2536`），不要附加 `/rconsole/api/parse-stats/global`。显式设置 `RCONSOLE_BASE_URL=` 可关闭接入。配置更新后重启 Node 服务；Docker 按下方说明重建容器以载入环境变量。

页面位于 `/statistics`，浏览器只请求本站 `/api/parse-stats`，每 30 秒自动刷新并支持暂停、手动刷新、7 / 30 天切换及解析次数 / 媒体时长切换。解析次数、平台分布与历史趋势只统计成功解析；成功率按媒体统计中的成功、失败次数计算，跳过记录不参与，零样本显示 `—`。媒体和成败指标自插件启用相关采集后累计，不回填旧记录，因此可能与累计成功解析次数存在差异。日期保留机器人服务器的本地日期口径。R 插件的全局统计独立于账号收发消息汇总，上游不提供按机器人账号排除沙盒的筛选参数。

脱敏在服务端完成：仅输出解析次数、参与用户数量、参与群数、已知平台名称、日期、群排行（含经代理转发的群头像）与平台媒体时长及媒体聚合值；**群名、QQ 号、OpenID、昵称、用户排行、模板路径、资源路径与图片渲染字段全部丢弃**。平台名使用固定白名单，未知平台合并为「其他」，时长与大小仅接受限定格式，嵌套对象不透传。全局统计路由不接受任何查询参数，`group_id`、`format`、URL 等一律拒绝；本页不代理上游统计图片。

除原有的解析趋势与平台分布外，全局页还展示：

- **群解析排行**：上游 `topGroups` 的前若干名，显示**脱敏群号、群头像、解析次数与参与人数**。群名是任意文本（可能包含真名、公司名等个人信息），无法用正则约束，因此不展示。排行支持按「次数」或「人数」切换排序；上游不为每个群提供时长，因此无法按时长排序。
- **群头像**：上游的 `groupAvatar` 是 `p.qlogo.cn/gh/<群号>/…` 形式，路径本身含真实群号，因此**不直接下发给浏览器**。服务端为每个群号用随机密钥派生一个不透明 ID（`HMAC-SHA256`，与账号卡片同一种做法），只把 `/api/parse-stats/group-avatar/<不透明 ID>` 交给前端；真实地址留在服务端内存注册表里，浏览器逐帧访问本站代理取图。代理沿用账号头像那套校验：仅允许 `qlogo.cn`、仅允许 `https`、拒绝重定向到其它主机、限制图片格式与 2 MB 上限、禁缓存失败结果。ID 每次进程启动重新派生，重启即失效，且不可反推群号。
- **平台媒体时长**：上游 `platformMediaRank` 按平台给出视频 / 音频时长，服务端把时长文本转成秒后降序排列，同时展示近 30 天媒体总时长（`mediaTrendText`）。

读取有 12 秒超时、1 MB 响应上限、30 秒成功缓存、并发请求合并与 60 秒失败冷却；禁止重定向，不透传上游错误正文、Cookie 或响应头。统计未开启、数据库未就绪或连接失败时独立提示异常，不影响账号或 AI 页面。

#### 按群解析统计

页面底部提供按群查询：输入群号后，浏览器只请求本站 `/api/parse-stats/group?group_id=<群号>`，服务端固定请求上游 `GET /rconsole/api/parse-stats/group?group_id=<群号>`，同样不需要任何凭据。

群号只用于发起查询，绝不进入页面地址、构建产物或页面上的其他位置。响应中回显的群号一律脱敏为 `12****89` 形式（与账号页的 UIN 规则一致）；不足 7 位的群号不回显任何数字。

群端点的响应结构与全局页不同，本页只输出其中的聚合值：群内累计成功解析（上游 `groupTotal`）、参与用户数（`uniqueUsers`）、群排行（`groupRank`）、全局对照（`globalTotal`、`globalGroups`）、平台分布与媒体处理指标。**群名、群头像、群成员账号、昵称与上游用户排行 `topUsers` 全部丢弃**。

按群查询按群号分别缓存与合并，一个群响应慢不会影响其他群，也不会串号；失败结果同样进入 60 秒冷却，冷却期内不重复请求上游。群号缺失、非纯数字或长度不合理时直接返回 400，不伪装成上游故障；上游明确回答「查无此群」时按空结果展示，不报错。

> 若上游群端点的路径或参数名变更，可用 `RCONSOLE_GROUP_PATH`、`RCONSOLE_GROUP_PARAM` 覆盖，无需改动代码。

- 每 30 秒自动刷新；支持暂停与手动刷新，页面在后台时不轮询。
- 可切换 1 小时、6 小时、24 小时、3 天和 7 天，以及接口返回的模型分组。
- 成功率、平均响应耗时和生成速度直接使用所选分组的接口统计。
- 图表展示 `groups[].series` 的真实采样点，不生成演示数据，不插入没有请求的零值。首字耗时为 0 / 负数视为未测得。
- Token 用量和请求数只统计日志接口此次返回记录中，匹配模型、分组及所选时间范围的请求，不代表完整历史总量。
- 日志支持模型 / 编号搜索、状态筛选、分页和详情复制；每页行数可选 8 / 15 / 30 / 50，切换行数或筛选条件时自动回到第一页。`type=2` 为消费请求，`type=5` 为失败请求；充值等账单记录不计入。
- 单个接口异常时，另一部分继续展示；全部异常显示重试提示，不伪装成正常运行。状态依据模型请求统计，不是机器人进程心跳。
- 时间按访问者浏览器的本地时区展示。

## 密钥隔离

浏览器仅请求同源 `/api/status?hours=24`、`/api/accounts`、`/api/group-stats`、`/api/parse-stats`、`/api/parse-stats/group`、`/api/parse-stats/group-avatar/<不透明 ID>` 及账号头像代理。服务端读取 `.env` 并为 AI / 锅巴接口附加各自的鉴权信息；群组统计、解析统计和头像请求不携带这些凭据，凭据不会写入前端源码、Vite 环境变量或构建产物。

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
