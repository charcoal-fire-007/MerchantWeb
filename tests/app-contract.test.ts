import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.vue'), 'utf8')
const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'styles.css'), 'utf8')
const splitRevealPath = path.join(process.cwd(), 'src', 'components', 'SplitRevealText.vue')
const splitRevealSource = fs.existsSync(splitRevealPath) ? fs.readFileSync(splitRevealPath, 'utf8') : ''
const gridDistortionPath = path.join(process.cwd(), 'src', 'components', 'GridDistortion.vue')
const loginBackgroundPath = path.join(process.cwd(), 'src', 'assets', 'login-mountain-lake-bg.jpg')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return cssSource.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] || ''
}

test('welcome section does not hardcode a specific merchant name', () => {
  assert.doesNotMatch(appSource, /欢迎回来，星享生活/)
  assert.match(appSource, /`👋 欢迎回来，\$\{merchantLabel\}`/)
})

test('welcome copy uses split reveal text animation without gsap dependency', () => {
  assert.match(appSource, /import SplitRevealText from '\.\/components\/SplitRevealText\.vue'/)
  assert.match(appSource, /<SplitRevealText[\s\S]*:text="`👋 欢迎回来，\$\{merchantLabel\}`"[\s\S]*tag="h1"/)
  assert.match(appSource, /<SplitRevealText[\s\S]*text="实时查看库存状态，收到新订单时请及时确认接单。"[\s\S]*tag="p"/)
  assert.doesNotMatch(splitRevealSource, /from 'gsap'|ScrollTrigger|GSAPSplitText/)
  assert.match(splitRevealSource, /IntersectionObserver/)
  assert.match(splitRevealSource, /split-reveal-char/)
  assert.match(splitRevealSource, /--split-index/)
  assert.match(cssSource, /\.split-reveal-char\s*\{[\s\S]*animation:\s*splitRevealIn/)
})

test('pause form is rendered inline with the expanded enabled product card', () => {
  assert.match(
    appSource,
    /<div v-for="p in filteredEnabled"[\s\S]*?<div v-if="expandingProduct === p\.rule_id" class="pause-form">/
  )
})

test('app persists merchant profile instead of relying only on token parsing', () => {
  assert.match(appSource, /localStorage\.getItem\('merchant_profile'\)/)
  assert.match(appSource, /extractMerchantSession/)
})

test('login page uses a single centered card without background image', () => {
  assert.match(appSource, /<aside class="sidebar" v-if="isLoggedIn">/)
  assert.match(appSource, /<main class="main" :class="\{ 'main-login': !isLoggedIn \}">/)
  assert.match(appSource, /<section v-if="!isLoggedIn" class="login-shell">/)
  assert.doesNotMatch(appSource, /GridDistortion/)
  assert.doesNotMatch(appSource, /loginDistortionImage/)
  assert.doesNotMatch(appSource, /class-name="login-distortion-bg"/)
  assert.match(appSource, /<section v-if="!isLoggedIn" class="login-shell">\s*<div class="login-form-panel">/)
  assert.match(appSource, /class="login-form-panel"/)
  assert.match(appSource, /<div class="login-form-panel">\s*<div class="login-card">/)
  assert.match(appSource, /class="login-form-copy"/)
  assert.match(appSource, /<h1>商户控制台<\/h1>/)
  assert.doesNotMatch(appSource, /<h1>登录商户控制台<\/h1>/)
  assert.match(appSource, /查看派单通知，管理商品接单状态/)
  assert.doesNotMatch(appSource, /<p class="login-eyebrow">商户登录<\/p>/)
  assert.doesNotMatch(appSource, /class="login-visual-panel"/)
  assert.doesNotMatch(appSource, /class="login-visual-card"/)
  assert.doesNotMatch(appSource, /class="login-visual-/)
  assert.doesNotMatch(appSource, /实时掌握每一次派单/)
  assert.doesNotMatch(appSource, /库存状态、接单控制、派单通知集中管理/)
  assert.doesNotMatch(appSource, /团团享设备租赁/)
  assert.doesNotMatch(appSource, /class="login-brand-anchor"/)
  assert.doesNotMatch(appSource, /class="login-brand-symbol"/)
  assert.doesNotMatch(appSource, /aria-label="团团享商户控制台"/)
  assert.doesNotMatch(appSource, /class="login-brand-panel"/)
  assert.doesNotMatch(appSource, /class="login-brand-mark"/)
  assert.doesNotMatch(appSource, /class="login-illustration"/)
  assert.doesNotMatch(appSource, /class="login-ill-card/)
  assert.doesNotMatch(appSource, /微信|Google|Apple|注册|验证码/)
  assert.doesNotMatch(appSource, /class="login-card-logo"/)
  assert.doesNotMatch(cssSource, /\.login-card-logo/)
  assert.equal(fs.existsSync(loginBackgroundPath), false)
  assert.match(cssSource, /\.main-login\s*\{[\s\S]*padding:\s*0/)
  assert.match(cssSource, /\.login-shell\s*\{[\s\S]*min-height:\s*100vh[\s\S]*grid-template-columns:\s*minmax\(320px,\s*420px\)/)
  assert.doesNotMatch(cssSource, /login-mountain-lake-bg|background:\s*url\(/)
  assert.match(cssSource, /\.login-shell\s*\{[\s\S]*position:\s*relative[\s\S]*overflow:\s*hidden/)
  assert.match(cssSource, /\.login-shell\s*\{[\s\S]*justify-content:\s*center/)
  assert.doesNotMatch(cssSource, /\.login-distortion-bg/)
  assert.match(cssSource, /\.login-form-panel\s*\{[\s\S]*z-index:\s*2/)
  assert.match(cssSource, /\.login-card\s*\{[\s\S]*width:\s*min\(380px,\s*100%\)[\s\S]*background:\s*rgba\(255,255,255,0\.94\)[\s\S]*box-shadow:\s*0 24px 70px/)
  assert.doesNotMatch(cssSource, /\.login-visual-/)
  assert.doesNotMatch(cssSource, /\.login-brand-anchor\s*\{/)
  assert.doesNotMatch(cssSource, /\.login-brand-symbol\s*\{/)
  assert.doesNotMatch(cssSource, /\.login-brand-panel\s*\{/)
  assert.doesNotMatch(cssSource, /\.login-illustration\s*\{/)
})

test('login page no longer ships a background animation component', () => {
  assert.equal(fs.existsSync(gridDistortionPath), false)
})

test('sidebar brand does not render meaningless standalone transfer icon', () => {
  assert.doesNotMatch(appSource, /class="sidebar-brand-icon"/)
  assert.doesNotMatch(cssSource, /\.sidebar-brand-icon/)
  assert.doesNotMatch(appSource, /<div class="sidebar-brand-icon">[\s\S]*?<\/div>/)
  assert.doesNotMatch(appSource, />转<\/div>/)
  assert.match(appSource, /<div class="sidebar-brand-copy"><strong>[\s\S]*?<\/strong><span>[\s\S]*?<\/span><\/div>/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/)
})

test('app prefers merchant names from loaded products when available', () => {
  assert.match(appSource, /const merchantNameFromProducts = computed/)
  assert.match(appSource, /product\.merchant_name/)
})

test('app renders real dispatch notifications from api polling', () => {
  assert.match(appSource, /const notifications = ref/)
  assert.match(appSource, /const notificationsSummary = reactive/)
  assert.match(appSource, /const dispatchTrend = ref/)
  assert.match(appSource, /async function refreshNotifications/)
  assert.match(appSource, /api\.listNotifications/)
  assert.match(appSource, /setInterval\(refreshNotifications/)
  assert.match(appSource, /todayAssigned = computed\(\(\) => notificationsSummary\.today_count\)/)
  assert.match(appSource, /v-for="notification in (?:filteredNotifications|notifications)"/)
})

test('login handles backend forced password change before entering merchant dashboard', () => {
  assert.match(appSource, /const forcePasswordChange = ref\(false\)/)
  assert.match(appSource, /const passwordChangeForm = reactive\(\{ newUsername: '', newPassword: '', confirmPassword: '' \}\)/)
  assert.match(appSource, /const pendingPasswordChangeToken = ref\(''\)/)
  assert.match(appSource, /if\s*\(result\.must_change_password\)\s*\{[\s\S]*pendingPasswordChangeToken\.value = result\.access_token[\s\S]*forcePasswordChange\.value = true[\s\S]*return/)
  assert.match(appSource, /async function completePasswordChange\(\)/)
  assert.match(appSource, /api\.changePassword\(newUsername, passwordChangeForm\.newPassword\)/)
  assert.match(appSource, /forcePasswordChange\.value = false/)
  assert.match(appSource, /loginForm\.username = newUsername/)
  assert.match(appSource, /sessionNotice\.value = '账号已设置成功，请使用新账号重新登录'/)
  assert.doesNotMatch(appSource, /completePasswordChange\(\)[\s\S]{0,900}enterMerchantDashboard\(result\)/)
  assert.match(appSource, /设置新账号和新密码/)
  assert.match(appSource, /新登录账号/)
  assert.match(appSource, /v-model="passwordChangeForm\.newUsername"/)
  assert.match(appSource, /autocomplete="username"/)
  assert.match(appSource, /autocomplete="new-password"/)
  assert.match(appSource, /@click="completePasswordChange"/)
  assert.match(appSource, /v-if="forcePasswordChange"/)
  assert.doesNotMatch(appSource, /result\.must_change_password[\s\S]{0,220}refreshProducts\(\)/)
})

test('forced password change inputs can toggle password visibility', () => {
  assert.match(appSource, /const passwordVisibility = reactive/)
  assert.match(appSource, /:type="passwordVisibility\.newPassword \? 'text' : 'password'"/)
  assert.match(appSource, /:type="passwordVisibility\.confirmPassword \? 'text' : 'password'"/)
  assert.match(appSource, /@click="passwordVisibility\.newPassword = !passwordVisibility\.newPassword"/)
  assert.match(appSource, /@click="passwordVisibility\.confirmPassword = !passwordVisibility\.confirmPassword"/)
  assert.match(appSource, /查看新密码/)
  assert.match(appSource, /查看确认新密码/)
  assert.match(appSource, /:aria-pressed="passwordVisibility\.newPassword"/)
  assert.match(appSource, /:aria-pressed="passwordVisibility\.confirmPassword"/)
  assert.match(appSource, /class="password-toggle-icon"/)
  assert.doesNotMatch(appSource, /👁/)
  assert.match(cssSource, /\.password-input-wrap/)
  assert.match(cssSource, /\.password-toggle/)
  assert.match(cssSource, /\.password-toggle-icon\s*\{[\s\S]*width:\s*18px[\s\S]*height:\s*18px/)
})

test('merchant login password input can toggle password visibility', () => {
  assert.match(appSource, /loginPassword:\s*false/)
  assert.match(appSource, /autocomplete="current-password"/)
  assert.match(appSource, /:type="passwordVisibility\.loginPassword \? 'text' : 'password'"/)
  assert.match(appSource, /@click="passwordVisibility\.loginPassword = !passwordVisibility\.loginPassword"/)
  assert.match(appSource, /查看密码/)
  assert.match(appSource, /隐藏密码/)
  assert.match(appSource, /:aria-pressed="passwordVisibility\.loginPassword"/)
})

test('merchant login validates required fields before requesting backend', () => {
  assert.match(appSource, /function getLoginValidationError\(\)/)
  assert.match(appSource, /const username = loginForm\.username\.trim\(\)/)
  assert.match(appSource, /return '请输入商户账号'/)
  assert.match(appSource, /return '请输入密码'/)
  assert.match(appSource, /const validationError = getLoginValidationError\(\)/)
  assert.match(appSource, /if \(validationError\) \{[\s\S]*error\.value = validationError[\s\S]*return[\s\S]*\}/)
  assert.match(appSource, /api\.login\(username, loginForm\.password\)/)
})

test('merchant login shows loading feedback and remember device option', () => {
  assert.match(appSource, /const rememberDevice = ref/)
  assert.match(appSource, /v-model="rememberDevice"/)
  assert.match(appSource, /记住此设备/)
  assert.match(appSource, /下次自动填入商户账号/)
  assert.match(appSource, /loading \? '登录中\.\.\.' : '登录'/)
  assert.match(appSource, /class="login-spinner"/)
  assert.match(cssSource, /\.login-spinner/)
  assert.match(cssSource, /@keyframes loginSpinner/)
})

test('merchant auth token avoids persistent localStorage storage', () => {
  assert.match(appSource, /const AUTH_TOKEN_KEY = 'merchant_token'/)
  assert.match(appSource, /function readStoredAuthToken\(\)/)
  assert.match(appSource, /sessionStorage\.getItem\(AUTH_TOKEN_KEY\)/)
  assert.match(appSource, /function persistAuthToken\(nextToken: string\)/)
  assert.match(appSource, /sessionStorage\.setItem\(AUTH_TOKEN_KEY, nextToken\)/)
  assert.match(appSource, /function clearAuthTokenStorage\(\)/)
  assert.match(appSource, /localStorage\.removeItem\(AUTH_TOKEN_KEY\)/)
  assert.doesNotMatch(appSource, /localStorage\.setItem\('merchant_token'/)
  assert.doesNotMatch(appSource, /localStorage\.getItem\('merchant_token'/)
})

test('logout distinguishes manual and expired session reasons', () => {
  assert.match(appSource, /type LogoutReason = 'manual' \| 'expired' \| 'password-reset-cancelled'/)
  assert.match(appSource, /const sessionNotice = ref\(''\)/)
  assert.match(appSource, /function logout\(reason: LogoutReason = 'manual'\)/)
  assert.match(appSource, /function getLogoutNotice\(reason: LogoutReason\)/)
  assert.match(appSource, /已安全退出登录/)
  assert.match(appSource, /登录已过期，请重新登录/)
  assert.match(appSource, /logout\('expired'\)/)
  assert.match(appSource, /@click="logout\('manual'\)"/)
  assert.match(appSource, /@click="logout\('password-reset-cancelled'\)"/)
  assert.match(appSource, /v-if="sessionNotice && !error"/)
  assert.match(cssSource, /\.login-notice/)
})

test('app resumes forced password change instead of booting dashboard from stored reset token', () => {
  assert.match(appSource, /if\s*\(tokenClaims\.value\?\.password_reset === true\)\s*\{/)
  assert.match(appSource, /pendingPasswordChangeToken\.value = token\.value/)
  assert.match(appSource, /token\.value = ''/)
  assert.match(appSource, /clearAuthTokenStorage\(\)/)
  assert.match(appSource, /forcePasswordChange\.value = true/)
  assert.match(appSource, /api\.setToken\(pendingPasswordChangeToken\.value\)/)
})

test('dashboard today stat uses api total order wording', () => {
  assert.match(appSource, /todayAssigned = computed\(\(\) => notificationsSummary\.today_count\)/)
  assert.match(appSource, /notificationsSummary\.today_count = result\.today_count/)
  assert.match(appSource, /<div class="stat-label">今日总单量<\/div>/)
  assert.match(appSource, /<div class="stat-sub">来自今日派单记录<\/div>/)
  assert.doesNotMatch(appSource, /<div class="stat-label">今日接单<\/div>/)
  assert.doesNotMatch(appSource, /<div class="stat-sub">等待派单分配<\/div>/)
})

test('dashboard renders echarts dispatch trend and limits notification preview', () => {
  assert.doesNotMatch(appSource, /from 'echarts\/charts'/)
  assert.doesNotMatch(appSource, /from 'echarts\/components'/)
  assert.doesNotMatch(appSource, /from 'echarts\/renderers'/)
  assert.match(appSource, /function ensureEcharts\(\)/)
  assert.match(appSource, /import\('echarts\/core'\)/)
  assert.match(appSource, /import\('echarts\/charts'\)/)
  assert.match(appSource, /import\('echarts\/components'\)/)
  assert.match(appSource, /import\('echarts\/renderers'\)/)
  assert.match(appSource, /const dispatchChartLoading = ref\(false\)/)
  assert.match(appSource, /const dispatchChartError = ref\(''\)/)
  assert.match(appSource, /图表加载中/)
  assert.match(appSource, /图表加载失败，请刷新页面重试/)
  assert.match(appSource, /ref="dispatchChartEl"/)
  assert.match(appSource, /renderDispatchTrendChart/)
  assert.match(appSource, /scheduleDispatchTrendRender/)
  assert.match(appSource, /requestAnimationFrame/)
  assert.match(appSource, /dispatchChartEl\.value\.clientWidth/)
  assert.match(appSource, /chart\.resize\(\)/)
  assert.match(appSource, /recentNotifications = computed\(\(\) => dashboardNotifications\.value\.slice\(0,\s*3\)\)/)
  assert.match(appSource, /newDispatchBurstCount\s*>\s*3/)
  assert.match(appSource, /goToNotifications/)
})

test('dashboard notifications show two-hour unread preview with read slide-away action', () => {
  assert.match(appSource, /import\s+\{\s*getRecentUnreadNotifications\s*\}\s+from\s+'\.\/notifications'/)
  assert.match(appSource, /const localReadNotificationIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /dashboardNotifications = computed\(\(\) => getRecentUnreadNotifications\(/)
  assert.match(appSource, /navUnreadCount = computed\(\(\) => navActive\.value === 'notifications' \? 0 : dashboardNotifications\.value\.length\)/)
  assert.match(appSource, /recentNotifications = computed\(\(\) => dashboardNotifications\.value\.slice\(0,\s*3\)\)/)
  assert.match(appSource, /hasMoreNotifications = computed\(\(\) => dashboardNotifications\.value\.length > recentNotifications\.value\.length\)/)
  assert.match(appSource, /查看全部 \{\{ dashboardNotifications\.length \}\} 条派单记录/)
  assert.match(appSource, /<TransitionGroup\s+name="notif-row-slide"/)
  assert.match(appSource, /@click="markNotificationRead\(notification\.id\)"/)
  assert.match(appSource, />已读<\/button>/)
  assert.match(appSource, /function markDashboardNotificationsRead\(\)[\s\S]*dashboardNotifications\.value\.map\(\(notification\) => notification\.id\)[\s\S]*localReadNotificationIds\.value = nextReadIds/)
  assert.match(appSource, /function goToNotifications\(\)[\s\S]*markDashboardNotificationsRead\(\)[\s\S]*navActive\.value = 'notifications'/)
  assert.match(cssSource, /\.notif-row-slide-leave-to\s*\{[\s\S]*translateX\(-120%\)/)
})

test('dashboard highlights freshly polled notification rows as merchant dispatch cards', () => {
  assert.match(appSource, /const highlightedNotificationIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /const notificationHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>\(\)/)
  assert.match(appSource, /function markFreshNotificationHighlights\(notifications: MerchantNotification\[\]\)/)
  assert.match(appSource, /markFreshNotificationHighlights\(newUnreadItems\)/)
  assert.match(appSource, /highlightedNotificationIds\.has\(notification\.id\)/)
  assert.doesNotMatch(appSource, /class="notif-icon"/)
  assert.doesNotMatch(appSource, /aria-hidden="true">📦<\/span>/)
  assert.doesNotMatch(cssSource, /\.notif-icon\s*\{/)
  const notifRowRule = cssRule('.notif-row')
  assert.match(notifRowRule, /padding:\s*10px 14px/)
  assert.match(notifRowRule, /border-radius:\s*var\(--radius-md\)/)
  assert.match(notifRowRule, /background:\s*var\(--primary-pale\)/)
  assert.doesNotMatch(notifRowRule, /box-shadow:/)
  assert.equal(cssRule('.notif-row:hover'), '')
  assert.match(cssSource, /\.notif-row-new\s*\{[\s\S]*animation:\s*notificationCardPop/)
  assert.match(cssSource, /@keyframes notificationCardPop/)
})

test('dashboard notification list animates when expanded or collapsed', () => {
  assert.match(appSource, /<Transition\s+name="notif-collapse"/)
  assert.match(appSource, /<div class="notif-list" v-if="notifOpen">/)
  assert.match(cssSource, /\.notif-collapse-enter-active,\s*\.notif-collapse-leave-active\s*\{[\s\S]*transition:/)
  assert.match(cssSource, /\.notif-collapse-enter-from,\s*\.notif-collapse-leave-to\s*\{[\s\S]*opacity:\s*0/)
  assert.match(cssSource, /\.notif-collapse-enter-from,\s*\.notif-collapse-leave-to\s*\{[\s\S]*translateY\(-8px\)/)
  assert.match(cssSource, /\.notif-collapse-enter-from,\s*\.notif-collapse-leave-to\s*\{[\s\S]*max-height:\s*0/)
  assert.match(cssSource, /\.notif-collapse-enter-to,\s*\.notif-collapse-leave-from\s*\{[\s\S]*max-height:\s*420px/)
})

test('dashboard cards use scroll-triggered animated content effect without gsap', () => {
  assert.doesNotMatch(appSource, /from 'gsap'/)
  assert.doesNotMatch(appSource, /ScrollTrigger/)
  assert.match(appSource, /const visibleDashboardCardIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /data-dashboard-card-id="stat-today"/)
  assert.match(appSource, /data-dashboard-card-id="notifications"/)
  assert.match(appSource, /data-dashboard-card-id="dispatch-chart"/)
  assert.match(appSource, /visibleDashboardCardIds\.has\('stat-today'\)/)
  assert.match(appSource, /visibleDashboardCardIds\.value\.has\(dashboardCardId\)/)
  assert.match(cssSource, /\.dashboard-card\s*\{[\s\S]*opacity:\s*0[\s\S]*translateY\(42px\)[\s\S]*scale\(0\.96\)/)
  assert.match(cssSource, /\.dashboard-card\s*\{[\s\S]*transition:[\s\S]*opacity\s+0\.75s[\s\S]*transform\s+0\.75s/)
  assert.match(cssSource, /\.dashboard-card\.in-view\s*\{[\s\S]*opacity:\s*1[\s\S]*translateY\(0\)[\s\S]*scale\(1\)/)
})

test('dashboard dispatch chart stacks dispatch counts by product without machine line', () => {
  assert.match(appSource, /buildDispatchProductSeries/)
  assert.match(appSource, /const dispatchProductSeries = computed/)
  assert.match(appSource, /stack:\s*'dispatch-product'/)
  assert.match(appSource, /trigger:\s*'item'/)
  assert.match(appSource, /seriesName/)
  assert.match(appSource, /notifications\.value/)
  assert.doesNotMatch(appSource, /focus:\s*'series'/)
  assert.match(appSource, /emphasis:\s*\{[^}]*focus:\s*'none'[^}]*disabled:\s*true/)
  assert.match(appSource, /borderRadius:\s*0/)
  assert.match(appSource, /borderWidth:\s*0/)
  assert.doesNotMatch(appSource, /borderRadius:\s*\[6,\s*6,\s*0,\s*0\]/)
  assert.doesNotMatch(appSource, /charts\.LineChart/)
  assert.doesNotMatch(appSource, /day\.machine_count/)
})

test('dashboard dispatch chart recreates echarts instance after tab remount', () => {
  assert.match(appSource, /function disposeDispatchTrendChart/)
  assert.match(appSource, /dispatchChart\.getDom\(\)\s*!==\s*dispatchChartEl\.value/)
  assert.match(appSource, /disposeDispatchTrendChart\(\)/)
  assert.match(appSource, /if\s*\(navActive\.value !== 'dashboard'\)[\s\S]*disposeDispatchTrendChart\(\)/)
})

test('notifications page renders concise dispatch record fields with detailed time', () => {
  for (const label of ['时间', '商品', '订单号', '订单标题']) {
    assert.match(appSource, new RegExp(label))
  }
  for (const label of ['关键词词目', '命中关键词', '分配商户']) {
    assert.doesNotMatch(appSource, new RegExp(label))
  }
  assert.match(appSource, /formatDispatchTime\(notification\.assigned_at\)/)
  assert.match(appSource, /year:\s*'numeric'/)
  assert.match(appSource, /month:\s*'long'/)
  assert.match(appSource, /day:\s*'numeric'/)
  assert.match(appSource, /class="dispatch-record-table"/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.dispatch-record-table-wrap\s*\{[\s\S]*display:\s*none/)
})

test('dispatch record table header uses sticky glass styling', () => {
  assert.match(cssSource, /\.dispatch-record-table-wrap\s*\{[\s\S]*border-radius:\s*var\(--radius-lg\)/)
  assert.match(cssSource, /\.dispatch-record-table\s*\{[\s\S]*border-collapse:\s*separate[\s\S]*border-spacing:\s*0/)
  assert.match(cssSource, /\.dispatch-record-table thead\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*0[\s\S]*z-index:\s*2/)
  assert.match(cssSource, /\.dispatch-record-table th\s*\{[\s\S]*background:\s*rgba\(255,255,255,0\.72\)/)
  assert.match(cssSource, /\.dispatch-record-table th\s*\{[\s\S]*backdrop-filter:\s*blur\(18px\)\s*saturate\(1\.25\)/)
  assert.match(cssSource, /\.dispatch-record-table th\s*\{[\s\S]*-webkit-backdrop-filter:\s*blur\(18px\)\s*saturate\(1\.25\)/)
})

test('merchant product cards hide matching keywords from merchants', () => {
  assert.doesNotMatch(appSource, /product-card-keywords/)
  assert.doesNotMatch(appSource, /product-card-kw/)
  assert.doesNotMatch(appSource, /p\.keywords\.some/)
})

test('product management collapses only enabled products so paused products stay easy to reach', () => {
  assert.match(appSource, /const enabledProductsCollapsed = ref\(false\)/)
  assert.match(appSource, /const isEnabledProductsCollapsed = computed\(\(\) => !hasProductSearch\.value && enabledProductsCollapsed\.value\)/)
  assert.match(appSource, /if\s*\(!enabledProductsCollapseTouched\.value\)\s*\{[\s\S]*enabledProductsCollapsed\.value = disabledProducts\.value\.length > 0/)
  assert.match(appSource, /function toggleEnabledProductsCollapse\(\)/)
  assert.match(appSource, /class="product-group-header"/)
  assert.match(appSource, /@click="toggleEnabledProductsCollapse"/)
  assert.match(appSource, /v-if="isEnabledProductsCollapsed"\s+class="product-collapse-summary"/)
  assert.match(appSource, /v-if="!isEnabledProductsCollapsed"\s+class="product-grid"/)
  assert.match(appSource, /<div v-if="filteredDisabled\.length > 0" class="product-group">[\s\S]*?<div class="product-grid">/)
  assert.match(cssSource, /\.product-collapse-enter-active,\s*\.product-collapse-leave-active\s*\{[\s\S]*transition:/)
  assert.match(cssSource, /\.product-collapse-summary\s*\{[\s\S]*cursor:\s*pointer/)
})

test('product management supports confirmed bulk pause and resume with progress feedback', () => {
  assert.match(appSource, /type BulkAvailabilityMode = 'pause' \| 'resume'/)
  assert.match(appSource, /const bulkAvailabilityDialog = reactive/)
  assert.match(appSource, /reason: '库存盘点'/)
  assert.match(appSource, /function openBulkAvailabilityDialog\(mode: BulkAvailabilityMode\)/)
  assert.match(appSource, /function selectedBulkProducts\(mode: BulkAvailabilityMode\)/)
  assert.match(appSource, /mode === 'pause' \? enabledProducts\.value : disabledProducts\.value/)
  assert.match(appSource, /async function confirmBulkAvailability\(\)/)
  assert.match(appSource, /api\.bulkUpdateAvailability\(/)
  assert.match(appSource, /已成功 \$\{result\.success_count\} 件，失败 \$\{result\.failed_count\} 件，请稍后重试/)
  assert.match(appSource, /一键暂停全部/)
  assert.match(appSource, /一键恢复全部/)
  assert.match(appSource, /确认暂停全部接单？/)
  assert.match(appSource, /确认恢复全部接单？/)
  assert.match(appSource, /处理中 \{\{ bulkAvailabilityProgress\.current \}\}\/\{\{ bulkAvailabilityProgress\.total \}\}/)
  assert.match(appSource, /class="bulk-dialog-backdrop"/)
  assert.match(cssSource, /\.product-toolbar\s*\{[\s\S]*display:\s*flex/)
  assert.match(cssSource, /\.bulk-dialog-backdrop\s*\{[\s\S]*position:\s*fixed/)
})

test('enabled product status badge says actively receiving orders', () => {
  assert.match(appSource, /<span class="status-badge active">正在接单<\/span>/)
  assert.doesNotMatch(appSource, /<span class="status-badge active">可接单<\/span>/)
})

test('product cards label status update time and pause reason clearly', () => {
  assert.match(appSource, /状态更新：\s*\{\{\s*relativeTime\(p\.updated_at\)\s*\}\}/)
  assert.match(appSource, /暂停原因：\s*\{\{\s*p\.reason \|\| '无库存'\s*\}\}\s*·\s*状态更新：\s*\{\{\s*relativeTime\(p\.updated_at\)\s*\}\}/)
})

test('product card in-view animation class is controlled by vue state', () => {
  assert.match(appSource, /const visibleProductCardIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /data-rule-id/)
  assert.match(appSource, /visibleProductCardIds\.has\(p\.rule_id\)/)
  assert.match(appSource, /entry\.target\.getAttribute\('data-rule-id'\)/)
  assert.doesNotMatch(appSource, /classList\.add\('in-view'\)/)
  assert.doesNotMatch(appSource, /classList\.remove\('in-view'\)/)
})

test('product card observer does not redeclare visibility state in one block', () => {
  assert.doesNotMatch(
    appSource,
    /const wasVisible = nextVisibleIds\.has\(ruleId\)\s+const wasVisible = nextVisibleIds\.has\(ruleId\)/
  )
})

test('product cards play a safe scroll-return animation without hiding again', () => {
  assert.match(appSource, /const productCardsInViewportIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /const returningProductCardIds = ref<Set<string>>\(new Set\(\)\)/)
  assert.match(appSource, /function triggerProductCardReturn/)
  assert.match(appSource, /returningProductCardIds\.has\(p\.rule_id\)/)
  assert.match(appSource, /'scroll-return': returningProductCardIds\.has\(p\.rule_id\)/)
  assert.match(cssSource, /\.product-card\.scroll-return\s*\{[\s\S]*animation:\s*productCardReturn/)
  assert.match(cssSource, /@keyframes\s+productCardReturn/)
  const returnAnimation = cssSource.match(/@keyframes\s+productCardReturn\s*\{[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(returnAnimation, /opacity:\s*0/)
})

test('pause reason panel uses a 0.58s elastic pop-in animation', () => {
  assert.match(appSource, /class="pause-form"/)
  assert.match(cssSource, /\.pause-form\s*\{[\s\S]*animation:\s*pauseFormPop\s+0\.58s/)
  assert.match(cssSource, /@keyframes\s+pauseFormPop/)
  assert.match(cssSource, /transform-origin:\s*top center/)
  const pauseAnimation = cssSource.match(/@keyframes\s+pauseFormPop\s*\{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(pauseAnimation, /0%\s*\{[^}]*opacity:\s*0[^}]*translateY\(-(?:8|9|10|11|12)px\)[^}]*scale\(0\.97/)
  assert.match(pauseAnimation, /(?:55|56|58|60)%\s*\{[^}]*opacity:\s*1[^}]*translateY\([23]px\)[^}]*scale\(1\.01/)
  assert.match(pauseAnimation, /(?:74|76|78|80)%\s*\{[^}]*translateY\(-1px\)[^}]*scale\(0\.99/)
})

test('mobile layout moves primary navigation into a bottom tab bar', () => {
  assert.match(appSource, /class="nav-badge"[\s\S]*navUnreadCount/)
  assert.match(appSource, /navActiveIndex = computed\(\(\) => \(\{ dashboard: 0, products: 1, notifications: 2 \}\[navActive\.value\] \?\? 0\)\)/)
  assert.match(appSource, /navActive === 'notifications'[\s\S]*历史派单[\s\S]*class="nav-badge"/)
  assert.match(appSource, /class="nav-active-indicator"[\s\S]*'--nav-active-index': navActiveIndex/)
  assert.match(appSource, /@click="goToNotifications"[\s\S]*v-if="navUnreadCount > 0"[\s\S]*navUnreadCount > 99 \? '99\+' : navUnreadCount/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar\s*\{[\s\S]*position:\s*static[\s\S]*height:\s*auto/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*0/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*position:\s*fixed[\s\S]*bottom:\s*12px;[\s\S]*bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*backdrop-filter:\s*blur\(4px\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*border-radius:\s*15px[\s\S]*background:\s*rgba\(255,255,255,0\.21\)[\s\S]*background-image:\s*linear-gradient\(135deg,\s*#ffffff4D,\s*#ffffff4D\s*\)[\s\S]*box-shadow:\s*0 5px 32px rgba\(0,0,0,0\.05\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav button\s*\{[\s\S]*flex-direction:\s*column/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.nav-active-indicator\s*\{[\s\S]*transform:\s*translateX\(calc\(var\(--nav-active-index,\s*0\) \* \(100% \+ 4px\)\)\)[\s\S]*transition:\s*transform 0\.28s cubic-bezier\(0\.2,\s*0\.9,\s*0\.2,\s*1\.18\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav button\.active\s*\{[\s\S]*background:\s*transparent/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav button\s*\{[\s\S]*z-index:\s*1/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.nav-badge\s*\{[\s\S]*position:\s*absolute/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.main:not\(\.main-login\)\s*\{[\s\S]*padding-bottom:\s*112px;[\s\S]*padding-bottom:\s*calc\(112px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*480px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*bottom:\s*10px;[\s\S]*bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*480px\)[\s\S]*\.main:not\(\.main-login\)\s*\{[\s\S]*padding-bottom:\s*108px;[\s\S]*padding-bottom:\s*calc\(108px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  assert.doesNotMatch(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-nav\s*\{[\s\S]*overflow-x:\s*auto/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-user\s*\{[\s\S]*display:\s*grid/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-logout\s*\{[\s\S]*display:\s*inline-flex/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-user\s*\{[\s\S]*display:\s*none/)
})

test('mobile merchant header uses compact glass app treatment', () => {
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand\s*\{[\s\S]*min-height:\s*56px[\s\S]*padding:\s*8px 16px[\s\S]*background:\s*rgba\(255,255,255,0\.62\)[\s\S]*border-bottom:\s*0[\s\S]*backdrop-filter:\s*blur\(18px\)\s*saturate\(1\.12\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-user strong\s*\{[\s\S]*font-size:\s*14px[\s\S]*font-weight:\s*900/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-user span\s*\{[\s\S]*font-size:\s*11px[\s\S]*opacity:\s*0\.62/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-logout\s*\{[\s\S]*min-height:\s*28px[\s\S]*padding:\s*0 12px[\s\S]*border-radius:\s*999px[\s\S]*background:\s*rgba\(255,255,255,0\.56\)[\s\S]*color:\s*var\(--body\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.main:not\(\.main-login\)\s*\{[\s\S]*padding-top:\s*24px/)
  assert.match(cssSource, /@media\s*\(max-width:\s*480px\)[\s\S]*\.sidebar-brand\s*\{[\s\S]*min-height:\s*52px[\s\S]*padding:\s*8px 14px/)
})

test('mobile dashboard places today and paused stats on the same row', () => {
  assert.match(appSource, /class="stat-card stat-card-today"/)
  assert.match(appSource, /class="stat-card stat-card-online"/)
  assert.match(appSource, /class="stat-card stat-card-paused"/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.stats-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.stat-card-today\s*\{[\s\S]*grid-column:\s*1[\s\S]*grid-row:\s*1/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.stat-card-paused\s*\{[\s\S]*grid-column:\s*2[\s\S]*grid-row:\s*1/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.stat-card-online\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1[\s\S]*grid-row:\s*2/)
})

test('mobile sidebar brand uses merchant identity instead of static brand copy', () => {
  assert.match(appSource, /class="sidebar-brand-copy"/)
  assert.match(appSource, /class="sidebar-brand-user"[\s\S]*\{\{\s*merchantLabel\s*\}\}[\s\S]*\{\{\s*accountLabel\s*\}\}/)
  assert.match(appSource, /class="sidebar-brand-logout"[\s\S]*@click="logout\('manual'\)"/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.sidebar-brand-copy\s*\{[\s\S]*display:\s*none/)
})

test('mobile product header avoids squeezed title and description text', () => {
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.product-header\s*\{[\s\S]*flex-direction:\s*column[\s\S]*align-items:\s*stretch/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.product-header p\s*\{[\s\S]*display:\s*none/)
  assert.match(cssSource, /@media\s*\(max-width:\s*768px\)[\s\S]*\.product-search input\s*\{[\s\S]*width:\s*100%/)
})
