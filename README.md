# MerchantWeb 商户外部端

MerchantWeb 是面向商户的外部控制台，用于查看派单通知、管理商品接单状态、查看历史派单，以及提交商品申请和问题/价格反馈。

## 功能概览

- **商户登录**：支持商户账号登录、首次登录强制设置正式账号和新密码。
- **仪表盘**：展示今日总单量、接单/暂停状态、近 7 天派单趋势和近 2 小时新派单提醒。
- **商品管理**：展示正在接单和暂停接单商品，支持单个商品暂停/恢复接单，也支持批量暂停/恢复。
- **历史派单**：展示派单记录列表，包含时间、商品、订单号和订单标题。
- **反馈中心**：支持商品申请、问题反馈、价格建议反馈，并统一展示提交记录。
- **移动端适配**：移动端使用底部 Tab Bar，顶部压缩为商户身份和退出入口。

## 技术栈

- Vue 3
- TypeScript
- Vite
- 原生 CSS
- Node.js 内置测试运行器
- Nginx 静态部署

## 目录结构

```text
.
├── src/
│   ├── App.vue                 # 主应用页面和交互逻辑
│   ├── api.ts                  # 后端 API Client 和接口类型
│   ├── auth.ts                 # 登录态、JWT、商户身份解析
│   ├── notifications.ts        # 仪表盘派单通知筛选逻辑
│   ├── styles.css              # 全局样式
│   └── components/
│       └── SplitRevealText.vue # 首页欢迎文字动效组件
├── tests/
│   ├── api.test.ts             # API Client 契约测试
│   ├── app-contract.test.ts    # 页面结构/行为契约测试
│   ├── auth.test.ts            # 登录态和身份解析测试
│   └── notifications.test.ts   # 通知筛选逻辑测试
├── docs/
│   └── superpowers/specs/      # 需求设计文档
├── Dockerfile                  # 前端构建 + Nginx 镜像
├── nginx.conf                  # 生产环境 Nginx 配置
├── vite.config.ts              # Vite 开发配置和本地 API 代理
└── package.json
```

## 本地开发

### 环境要求

- Node.js 22 或兼容版本
- npm
- 本地后端服务默认运行在 `http://localhost:8000`

### 安装依赖

```powershell
npm install
```

### 启动前端

```powershell
npm.cmd run dev
```

默认访问地址：

```text
http://localhost:5174/
```

Vite 会把 `/api` 代理到：

```text
http://localhost:8000
```

如需改后端地址，请修改 `vite.config.ts` 中的 `server.proxy['/api'].target`。

## 常用命令

```powershell
# 启动开发服务
npm.cmd run dev

# 运行测试
npm.cmd test

# 类型检查并构建生产包
npm.cmd run build

# 本地预览生产构建
npm.cmd run preview
```

## 后端接口依赖

前端通过 `src/api.ts` 访问后端接口，主要依赖：

```text
POST /api/auth/login
POST /api/auth/change-password
GET  /api/auth/me

GET  /api/merchant/products
POST /api/merchant/products/:rule_id/availability
POST /api/merchant/products/availability/bulk

GET  /api/merchant/notifications

GET  /api/merchant/feedback
POST /api/merchant/feedback

GET  /api/merchant/product-applications/options
GET  /api/merchant/product-applications
POST /api/merchant/product-applications
```

生产环境中，`nginx.conf` 会把 `/api/` 转发到容器网络中的 `backend:8000`。

## 认证与安全说明

- 登录 token 存在 `sessionStorage`，避免长期明文保存在 `localStorage`。
- “记住此设备”只保存商户账号，不保存密码和 token。
- 401 会触发登录过期流程，并引导商户重新登录。
- 管理员重置后的临时账号需要商户首次登录后设置正式账号和新密码。

## 测试策略

项目使用 Node.js 内置测试运行器：

```powershell
npm.cmd test
```

测试覆盖重点：

- API 请求路径、方法和请求体契约
- 登录态、商户身份和 token 解析
- 仪表盘近 2 小时未读派单筛选逻辑
- 页面关键结构和文案契约，防止 UI 回退
- 反馈中心不暴露平台内部实现词

## 构建与部署

### 本地构建

```powershell
npm.cmd run build
```

构建产物输出到：

```text
dist/
```

### Docker 构建

```powershell
docker build -t merchant-web .
```

### Docker 运行

```powershell
docker run --rm -p 8080:80 merchant-web
```

访问：

```text
http://localhost:8080/
```

生产部署时需要确保 Nginx 能访问后端服务名 `backend:8000`，或按实际服务地址调整 `nginx.conf`。

## 设计文档

Superpowers 需求设计文档位于：

```text
docs/superpowers/specs/
```

当前反馈中心精简方案：

```text
docs/superpowers/specs/2026-05-25-feedback-center-simplification-design.md
```

## 开发约定

- 修改行为前优先更新契约测试。
- 保持商户端文案面向商户，不暴露平台内部概念。
- 优先做小范围、可验证改动。
- 提交前运行：

```powershell
npm.cmd test
npm.cmd run build
```
