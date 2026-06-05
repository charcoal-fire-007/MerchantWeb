# MerchantWeb → MerchantMiniApp 微信小程序迁移全过程记录

## 一、项目背景

**原始项目**：`MerchantWeb`
- 技术栈：Vite + TypeScript + 原生 DOM / CSS
- 目标平台：桌面端 H5 浏览器
- 特点：侧边栏导航、hover 效果、IntersectionObserver 入场动画、图表趋势展示

**迁移目标**：`MerchantMiniApp`
- 技术栈：uni-app x（uvue/uts）
- 目标平台：微信小程序
- 策略：独立 sibling 项目，不修改原 H5，后端 API 完全复用

---

## 二、关键决策

### 2.1 架构决策
- **独立项目**：在 `D:\Program Files(x64)\text\MerchantWeb\MerchantMiniApp` 新建项目，不触碰原 H5
- **API 复用**：后端地址使用生产环境 `https://mweb.leejh.cyou`，所有接口契约保持与 H5 完全一致
- **存储替换**：用 uni-app 存储 API（`uni.getStorageSync` / `uni.setStorageSync`）替代浏览器的 `localStorage`
- **请求替换**：用 `uni.request` 替代浏览器的 `fetch`
- **移除浏览器专属 API**：
  - 删除 IntersectionObserver 入场动画
  - 删除 hover / focus-visible 桌面交互
  - 删除 `document.querySelectorAll`、`window` 直接操作
  - 删除 `getBoundingClientRect` tooltip 定位

---

## 三、文件结构与配置

### 3.1 项目根目录结构
```text
MerchantMiniApp/
├── App.uvue              # 应用入口（全局 page 背景色、字体）
├── main.uts              # createSSRApp 挂载
├── manifest.json         # 微信小程序 AppID 等配置
├── pages.json            # 页面路由 + TabBar 配置
├── env.uts               # API_BASE_URL 及存储 key 常量
├── uni.scss              # 品牌色变量
├── pages/
│   ├── login/login.uvue
│   ├── workspace/workspace.uvue
│   ├── profile/profile.uvue
│   ├── dispatches/dispatches.uvue
│   ├── my-products/my-products.uvue
│   └── feedback/feedback.uvue
├── services/
│   ├── api.uts           # uni.request 封装 + 所有后端接口
│   ├── session.uts       # token / profile / remember 存储读写
│   ├── auth.uts          # token 解析、商户身份提取
│   ├── errors.uts        # 错误类 + HTTP 状态码映射
│   ├── navigation.uts    # relaunchToLogin 安全跳转
│   └── notifications.uts # 近 2 小时未读派单筛选逻辑
├── models/
│   └── merchant.uts      # 所有 TypeScript 类型定义
└── components/
    ├── EmptyState.uvue       # 空状态组件
    ├── NotificationCard.uvue # 派单卡片
    ├── ProductCard.uvue      # 商品卡片
    └── StatCard.uvue         # 统计卡片
```

### 3.2 manifest.json 配置
```json
{
  "name": "MerchantMiniApp",
  "appid": "__UNI__MERCHANT_MINIAPP",
  "versionName": "0.1.0",
  "versionCode": "100",
  "mp-weixin": {
    "appid": "wxe7048aa119ed2be5",
    "setting": {
      "urlCheck": false,
      "es6": true,
      "postcss": true,
      "minified": true
    },
    "usingComponents": true
  }
}
```

### 3.3 pages.json 配置
```json


### 3.4 env.uts 环境配置
```ts
export const API_BASE_URL = 'https://mweb.leejh.cyou'

export const AUTH_TOKEN_KEY = 'merchant_token'
export const REMEMBER_DEVICE_KEY = 'merchant_remember_device'
export const REMEMBERED_USERNAME_KEY = 'merchant_remembered_username'
export const MERCHANT_PROFILE_KEY = 'merchant_profile'
```

---

## 四、核心服务层实现

### 4.1 API 客户端（api.uts）
用 `uni.request` 封装统一 HTTP 客户端：
- 自动附加 `Authorization: Bearer <token>`
- 401 时自动调用 `clearSession()` 清除登录态
- 支持 GET / POST，统一错误映射
- 所有后端接口：登录、改密、商户信息、商品列表、可用性更新、批量更新、派单列表、反馈提交、商品申请等

### 4.2 会话管理（session.uts）
- `readStoredAuthToken()` → `uni.getStorageSync`
- `writeStoredAuthToken()` → `uni.setStorageSync`
- `clearSession()` → `uni.removeStorageSync`（token + profile）
- 记住账号：读写 `merchant_remember_device` 和 `merchant_remembered_username`

### 4.3 导航工具（navigation.uts）

**关键修复**：必须使用 `setTimeout(..., 0)`，否则在 appLaunch 阶段调用 `uni.reLaunch` 会因页面栈非空而报错。

---

## 五、遇到的坑与修复

### 5.1 wxss tag 选择器编译报错
**问题**：微信小程序不允许在组件 `<style>` 中使用 tag 选择器（如 `button`、`input`）。
**修复**：所有 `button` 改为显式 class（如 `.action-button`、`.bulk-button`、`.tab-button`）。

### 5.2 appLaunch 阶段 relaunch 报错
**问题**：`uni.reLaunch` 在 `onLaunch` 或页面初始化时调用，提示页面栈非空。
**修复**：`navigation.uts` 中包一层 `setTimeout(..., 0)`。

### 5.3 HBuilderX WebSocket 热更新失败
**问题**：开发时 HBuilderX 连接微信小程序模拟器的 WebSocket 报 `Invalid frame header`。
**结论**：不影响编译和预览，属于开发工具已知问题，可忽略。

---

## 六、视觉规范

| Token | 值 | 用途 |
|-------|-----|------|


---

## 七、验证清单

- [x] 项目结构完整，uni-app x 编译通过
- [x] 登录页可正常渲染

- [x] 所有样式使用 class 选择器，无 tag 选择器
- [x] 服务层（api/session/auth）完整保留，未破坏 H5

---