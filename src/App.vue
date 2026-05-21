<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ApiError, api, type LoginResponse, type MerchantNotification, type MerchantNotificationTrendDay, type MerchantProduct } from './api'
import {
  decodeTokenClaims,
  extractMerchantSession,
  getMerchantIdentityFromSession,
  type MerchantSession,
} from './auth'
import SplitRevealText from './components/SplitRevealText.vue'
import { getRecentUnreadNotifications } from './notifications'

type BulkAvailabilityMode = 'pause' | 'resume'
type LogoutReason = 'manual' | 'expired' | 'password-reset-cancelled'

interface DispatchChartBarSegment {
  product: string
  count: number
  color: string
  heightPercent: number
  title: string
}

interface DispatchChartBar {
  date: string
  label: string
  total: number
  heightPercent: number
  segments: DispatchChartBarSegment[]
}

const AUTH_TOKEN_KEY = 'merchant_token'
const REMEMBER_DEVICE_KEY = 'merchant_remember_device'
const REMEMBERED_USERNAME_KEY = 'merchant_remembered_username'

const token = ref(readStoredAuthToken())
const merchantSession = ref<MerchantSession | null>(readStoredMerchantSession())
const loginForm = reactive({ username: readRememberedUsername(), password: '' })
const passwordChangeForm = reactive({ newUsername: '', newPassword: '', confirmPassword: '' })
const passwordVisibility = reactive({ loginPassword: false, newPassword: false, confirmPassword: false })
const rememberDevice = ref(readRememberDevicePreference())
const forcePasswordChange = ref(false)
const pendingPasswordChangeToken = ref('')
const loading = ref(false)
const error = ref('')
const sessionNotice = ref('')
const products = ref<MerchantProduct[]>([])
const notifications = ref<MerchantNotification[]>([])
const dispatchTrend = ref<MerchantNotificationTrendDay[]>([])
const notificationsSummary = reactive({ today_count: 0, unread_count: 0 })
const knownNotificationIds = ref<Set<string>>(new Set())
const localReadNotificationIds = ref<Set<string>>(new Set())
const highlightedNotificationIds = ref<Set<string>>(new Set())
const notificationsLoaded = ref(false)
const newDispatchBurstCount = ref(0)
const dispatchChartTooltip = reactive({
  visible: false,
  product: '',
  date: '',
  count: 0,
  x: 0,
  y: 0,
})
const expandingProduct = ref<string | null>(null)
const pauseForm = reactive({ reason: '' })
const submittingProduct = ref<string | null>(null)
const bulkAvailabilityDialog = reactive({
  open: false,
  mode: 'pause' as BulkAvailabilityMode,
  reason: '库存盘点',
})
const bulkAvailabilityProgress = reactive({ processing: false, current: 0, total: 0 })
const navActive = ref('dashboard')
const notifOpen = ref(true)
const visibleProductCardIds = ref<Set<string>>(new Set())
const visibleDashboardCardIds = ref<Set<string>>(new Set())
const productCardsInViewportIds = ref<Set<string>>(new Set())
const returningProductCardIds = ref<Set<string>>(new Set())
let productCardsObserver: IntersectionObserver | null = null
const productCardReturnTimers = new Map<string, ReturnType<typeof setTimeout>>()
const notificationHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>()
let bulkAvailabilityProgressTimer: ReturnType<typeof setInterval> | null = null

const tokenClaims = computed(() => decodeTokenClaims(token.value))
const merchantNameFromProducts = computed(() => {
  const product = products.value.find(
    (product) => typeof product.merchant_name === 'string' && product.merchant_name.trim()
  )
  return product?.merchant_name?.trim() || ''
})
const merchantIdentity = computed(() =>
  getMerchantIdentityFromSession(merchantSession.value, tokenClaims.value, merchantNameFromProducts.value)
)
const subject = computed(() => merchantIdentity.value?.subject || '')
const merchantLabel = computed(() => merchantIdentity.value?.displayName || subject.value || '商户')
const accountLabel = computed(() => merchantSession.value?.username || subject.value || '商户账号')

const isLoggedIn = computed(() => Boolean(token.value))
const enabledProducts = computed(() => products.value.filter((p) => p.available))
const disabledProducts = computed(() => products.value.filter((p) => !p.available))
const todayAssigned = computed(() => notificationsSummary.today_count)
const onlineCount = computed(() => enabledProducts.value.length)
const pendingCount = computed(() => disabledProducts.value.length)
const dashboardNotifications = computed(() => getRecentUnreadNotifications(
  notifications.value,
  { localReadIds: localReadNotificationIds.value },
))
const navUnreadCount = computed(() => navActive.value === 'notifications' ? 0 : dashboardNotifications.value.length)
const navActiveIndex = computed(() => ({ dashboard: 0, products: 1, notifications: 2 }[navActive.value] ?? 0))
const recentNotifications = computed(() => dashboardNotifications.value.slice(0, 3))
const hasMoreNotifications = computed(() => dashboardNotifications.value.length > recentNotifications.value.length)
const dispatchTrendTotal = computed(() => dispatchTrend.value.reduce((total, day) => total + day.dispatch_count, 0))
const dispatchChartMax = computed(() => Math.max(1, ...dispatchTrend.value.map((day) => day.dispatch_count)))
const dispatchChartGridLines = computed(() => {
  const max = dispatchChartMax.value
  return [max, Math.ceil(max * 0.75), Math.ceil(max * 0.5), Math.ceil(max * 0.25), 0]
    .filter((value, index, values) => values.indexOf(value) === index)
})
const dispatchChartBars = computed(() => buildDispatchChartBars())
const productSearch = ref('')
const enabledProductsCollapsed = ref(false)
const enabledProductsCollapseTouched = ref(false)
const hasProductSearch = computed(() => productSearch.value.trim().length > 0)
const isEnabledProductsCollapsed = computed(() => !hasProductSearch.value && enabledProductsCollapsed.value)
let notificationsTimer: ReturnType<typeof setInterval> | null = null
const dispatchProductColors = [
  '#9fe870',
  '#67e8f9',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#34d399',
  '#f97316',
  '#60a5fa',
]

const filteredEnabled = computed(() => {
  const kw = productSearch.value.trim().toLowerCase()
  if (!kw) return enabledProducts.value
  return enabledProducts.value.filter((p) => p.product.toLowerCase().includes(kw))
})
const filteredDisabled = computed(() => {
  const kw = productSearch.value.trim().toLowerCase()
  if (!kw) return disabledProducts.value
  return disabledProducts.value.filter((p) => p.product.toLowerCase().includes(kw))
})

if (tokenClaims.value?.password_reset === true) {
  pendingPasswordChangeToken.value = token.value
  token.value = ''
  clearAuthTokenStorage()
  forcePasswordChange.value = true
  api.setToken(pendingPasswordChangeToken.value)
}

api.setUnauthorizedHandler(() => {
  if (token.value || pendingPasswordChangeToken.value) {
    logout('expired')
  }
})

if (isLoggedIn.value) {
  api.setToken(token.value)
  if (!merchantSession.value) {
    void refreshMerchantSession()
  }
  void refreshProducts()
  void refreshNotifications()
  startNotificationsPolling()
}
onMounted(() => {
  observeProductCards()
})
onUnmounted(() => {
  stopNotificationsPolling()
  disconnectProductCardsObserver()
  clearProductCardReturnTimers()
  clearNotificationHighlightTimers()
  stopBulkAvailabilityProgress()
})
watch([filteredEnabled, filteredDisabled, navActive], () => {
  void nextTick(observeProductCards)
})
watch([notifications, navActive], () => {
  void nextTick(observeProductCards)
})
watch([disabledProducts, productSearch], () => {
  if (!enabledProductsCollapseTouched.value) {
    enabledProductsCollapsed.value = disabledProducts.value.length > 0
  }
}, { immediate: true })
watch(isEnabledProductsCollapsed, () => {
  if (!isEnabledProductsCollapsed.value) {
    void nextTick(observeProductCards)
  }
})

function disconnectProductCardsObserver() {
  productCardsObserver?.disconnect()
  productCardsObserver = null
}

function clearProductCardReturnTimers() {
  for (const timer of productCardReturnTimers.values()) {
    clearTimeout(timer)
  }
  productCardReturnTimers.clear()
  returningProductCardIds.value = new Set()
}

function clearNotificationHighlightTimers() {
  for (const timer of notificationHighlightTimers.values()) {
    clearTimeout(timer)
  }
  notificationHighlightTimers.clear()
  highlightedNotificationIds.value = new Set()
}

function triggerProductCardReturn(ruleId: string) {
  const existingTimer = productCardReturnTimers.get(ruleId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const nextReturningIds = new Set(returningProductCardIds.value)
  nextReturningIds.add(ruleId)
  returningProductCardIds.value = nextReturningIds

  const timer = setTimeout(() => {
    productCardReturnTimers.delete(ruleId)
    const nextIds = new Set(returningProductCardIds.value)
    nextIds.delete(ruleId)
    returningProductCardIds.value = nextIds
  }, 320)
  productCardReturnTimers.set(ruleId, timer)
}

function observeProductCards() {
  disconnectProductCardsObserver()
  const selectors = navActive.value === 'products'
    ? '.product-card[data-rule-id]'
    : navActive.value === 'dashboard' ? '.dashboard-card[data-dashboard-card-id]' : ''
  if (!selectors) return
  const cards = document.querySelectorAll(selectors)
  if (cards.length === 0) return
  if (!('IntersectionObserver' in window)) {
    const nextVisibleIds = new Set(visibleProductCardIds.value)
    const nextViewportIds = new Set(productCardsInViewportIds.value)
    const nextDashboardIds = new Set(visibleDashboardCardIds.value)
    for (const card of cards) {
      const ruleId = card.getAttribute('data-rule-id')
      const dashboardCardId = card.getAttribute('data-dashboard-card-id')
      if (ruleId) {
        nextVisibleIds.add(ruleId)
        nextViewportIds.add(ruleId)
      }
      if (dashboardCardId) {
        nextDashboardIds.add(dashboardCardId)
      }
    }
    visibleProductCardIds.value = nextVisibleIds
    productCardsInViewportIds.value = nextViewportIds
    visibleDashboardCardIds.value = nextDashboardIds
    return
  }
  productCardsObserver = new IntersectionObserver(
    (entries) => {
      const nextVisibleIds = new Set(visibleProductCardIds.value)
      const nextViewportIds = new Set(productCardsInViewportIds.value)
      const nextDashboardIds = new Set(visibleDashboardCardIds.value)
      let visibleChanged = false
      let viewportChanged = false
      let dashboardChanged = false
      for (const entry of entries) {
        const ruleId = entry.target.getAttribute('data-rule-id')
        const dashboardCardId = entry.target.getAttribute('data-dashboard-card-id')
        if (dashboardCardId) {
          if (entry.isIntersecting && !visibleDashboardCardIds.value.has(dashboardCardId)) {
            nextDashboardIds.add(dashboardCardId)
            dashboardChanged = true
          }
          continue
        }
        if (!ruleId) {
          continue
        }
        if (entry.isIntersecting) {
          const wasVisible = nextVisibleIds.has(ruleId)
          const wasInViewport = productCardsInViewportIds.value.has(ruleId)
          if (!wasVisible) {
            nextVisibleIds.add(ruleId)
            visibleChanged = true
          } else if (!wasInViewport) {
            triggerProductCardReturn(ruleId)
          }
          nextViewportIds.add(ruleId)
          viewportChanged = true
        } else if (nextViewportIds.delete(ruleId)) {
          viewportChanged = true
        }
      }
      if (visibleChanged) {
        visibleProductCardIds.value = nextVisibleIds
      }
      if (viewportChanged) {
        productCardsInViewportIds.value = nextViewportIds
      }
      if (dashboardChanged) {
        visibleDashboardCardIds.value = nextDashboardIds
      }
    },
    { threshold: 0.1 }
  )
  for (const card of cards) {
    productCardsObserver.observe(card)
  }
}

async function login() {
  const validationError = getLoginValidationError()
  if (validationError) {
    sessionNotice.value = ''
    error.value = validationError
    return
  }

  await run(async () => {
    const username = loginForm.username.trim()
    const result = await api.login(username, loginForm.password)
    if (result.role !== 'merchant') throw new Error('此账号不是商户账号')
    persistRememberedLogin(username)
    if (result.must_change_password) {
      pendingPasswordChangeToken.value = result.access_token
      passwordChangeForm.newUsername = ''
      passwordChangeForm.newPassword = ''
      passwordChangeForm.confirmPassword = ''
      passwordVisibility.loginPassword = false
      passwordVisibility.newPassword = false
      passwordVisibility.confirmPassword = false
      forcePasswordChange.value = true
      saveMerchantSession(extractMerchantSession(result))
      api.setToken(result.access_token)
      return
    }

    await enterMerchantDashboard(result)
  })
}

function getLoginValidationError() {
  const username = loginForm.username.trim()
  if (!username) {
    return '请输入商户账号'
  }
  if (!loginForm.password.trim()) {
    return '请输入密码'
  }
  return ''
}

async function completePasswordChange() {
  await run(async () => {
    const newUsername = passwordChangeForm.newUsername.trim()
    const newPassword = passwordChangeForm.newPassword.trim()
    if (newUsername.length < 2) {
      throw new Error('新登录账号至少 2 位')
    }
    if (newPassword.length < 6) {
      throw new Error('新密码至少 6 位')
    }
    if (newPassword !== passwordChangeForm.confirmPassword) {
      throw new Error('两次输入的新密码不一致')
    }
    if (!pendingPasswordChangeToken.value) {
      throw new Error('改密登录状态已失效，请重新登录')
    }

    api.setToken(pendingPasswordChangeToken.value)
    await api.changePassword(newUsername, passwordChangeForm.newPassword)

    token.value = ''
    clearAuthTokenStorage()
    api.setToken('')
    forcePasswordChange.value = false
    pendingPasswordChangeToken.value = ''
    loginForm.username = newUsername
    loginForm.password = ''
    persistRememberedLogin(newUsername)
    saveMerchantSession(null)
    products.value = []
    notifications.value = []
    dispatchTrend.value = []
    notificationsSummary.today_count = 0
    notificationsSummary.unread_count = 0
    passwordChangeForm.newUsername = ''
    passwordChangeForm.newPassword = ''
    passwordChangeForm.confirmPassword = ''
    passwordVisibility.newPassword = false
    passwordVisibility.confirmPassword = false
    sessionNotice.value = '账号已设置成功，请使用新账号重新登录'
  })
}

async function enterMerchantDashboard(result: LoginResponse) {
  token.value = result.access_token
  persistAuthToken(result.access_token)
  saveMerchantSession(extractMerchantSession(result))
  api.setToken(result.access_token)
  sessionNotice.value = ''
  loginForm.password = ''
  passwordVisibility.loginPassword = false
  if (!merchantSession.value) {
    await refreshMerchantSession()
  }
  await refreshProducts()
  await refreshNotifications()
  startNotificationsPolling()
}

async function refreshMerchantSession() {
  try {
    const result = await api.getCurrentMerchant()
    saveMerchantSession(extractMerchantSession(result))
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
      return
    }
    throw err
  }
}

async function refreshProducts() {
  await run(async () => {
    products.value = await api.listProducts()

    const session = merchantSession.value
    if (session && !session.merchantName && merchantNameFromProducts.value) {
      saveMerchantSession({
        ...session,
        merchantName: merchantNameFromProducts.value,
      })
    }
  })
}

async function refreshNotifications() {
  try {
    const result = await api.listNotifications()
    const nextItems = result.items
    if (notificationsLoaded.value) {
      const newItems = nextItems.filter((item) => !knownNotificationIds.value.has(item.id))
      const newUnreadItems = getRecentUnreadNotifications(newItems, {
        localReadIds: localReadNotificationIds.value,
      })
      newDispatchBurstCount.value = newUnreadItems.length > 3 ? newUnreadItems.length : 0
      markFreshNotificationHighlights(newUnreadItems)
    }
    notifications.value = result.items
    dispatchTrend.value = result.chart || []
    notificationsSummary.today_count = result.today_count
    notificationsSummary.unread_count = result.unread_count
    knownNotificationIds.value = new Set(nextItems.map((item) => item.id))
    notificationsLoaded.value = true
    if (navActive.value === 'notifications') {
      markDashboardNotificationsRead()
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return
    }
    error.value = err instanceof Error ? err.message : '通知加载失败'
  }
}

function startNotificationsPolling() {
  stopNotificationsPolling()
  notificationsTimer = setInterval(refreshNotifications, 30000)
}

function stopNotificationsPolling() {
  if (notificationsTimer) {
    clearInterval(notificationsTimer)
    notificationsTimer = null
  }
}

function goToNotifications() {
  markDashboardNotificationsRead()
  navActive.value = 'notifications'
  newDispatchBurstCount.value = 0
}

function markDashboardNotificationsRead() {
  const notificationIds = dashboardNotifications.value.map((notification) => notification.id)
  if (notificationIds.length === 0) return

  const nextReadIds = new Set(localReadNotificationIds.value)
  const nextHighlightedIds = new Set(highlightedNotificationIds.value)
  for (const notificationId of notificationIds) {
    nextReadIds.add(notificationId)
    nextHighlightedIds.delete(notificationId)
    const highlightTimer = notificationHighlightTimers.get(notificationId)
    if (highlightTimer) {
      clearTimeout(highlightTimer)
      notificationHighlightTimers.delete(notificationId)
    }
  }
  localReadNotificationIds.value = nextReadIds
  highlightedNotificationIds.value = nextHighlightedIds
  notificationsSummary.unread_count = Math.max(0, notificationsSummary.unread_count - notificationIds.length)
}

function markNotificationRead(notificationId: string) {
  const nextReadIds = new Set(localReadNotificationIds.value)
  nextReadIds.add(notificationId)
  localReadNotificationIds.value = nextReadIds
  const nextHighlightedIds = new Set(highlightedNotificationIds.value)
  nextHighlightedIds.delete(notificationId)
  highlightedNotificationIds.value = nextHighlightedIds
  const highlightTimer = notificationHighlightTimers.get(notificationId)
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    notificationHighlightTimers.delete(notificationId)
  }
  notificationsSummary.unread_count = Math.max(0, notificationsSummary.unread_count - 1)
}

function markFreshNotificationHighlights(notifications: MerchantNotification[]) {
  if (notifications.length === 0 || notifications.length > 3) {
    return
  }

  const nextHighlightedIds = new Set(highlightedNotificationIds.value)
  for (const notification of notifications) {
    nextHighlightedIds.add(notification.id)
    const existingTimer = notificationHighlightTimers.get(notification.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    const timer = setTimeout(() => {
      notificationHighlightTimers.delete(notification.id)
      const nextIds = new Set(highlightedNotificationIds.value)
      nextIds.delete(notification.id)
      highlightedNotificationIds.value = nextIds
    }, 5200)
    notificationHighlightTimers.set(notification.id, timer)
  }
  highlightedNotificationIds.value = nextHighlightedIds
}

function dash(value: string | null | undefined) {
  const text = String(value || '').trim()
  return text || '-'
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function formatDateKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function normalizeProductName(value: string | null | undefined) {
  const product = String(value || '').trim()
  return product || '未标记商品'
}

function buildDispatchChartBars(): DispatchChartBar[] {
  const trendDates = dispatchTrend.value.map((day) => day.date)
  const trendDateSet = new Set(trendDates)
  const countsByProduct = new Map<string, Map<string, number>>()
  const totalsByDate = new Map<string, number>()
  const productOrder: string[] = []

  const addProductCount = (product: string, date: string, count: number) => {
    if (!countsByProduct.has(product)) {
      countsByProduct.set(product, new Map())
      productOrder.push(product)
    }
    const productCounts = countsByProduct.get(product)!
    productCounts.set(date, (productCounts.get(date) || 0) + count)
    totalsByDate.set(date, (totalsByDate.get(date) || 0) + count)
  }

  for (const notification of notifications.value) {
    const dateKey = formatDateKey(notification.assigned_at)
    if (!trendDateSet.has(dateKey)) {
      continue
    }
    addProductCount(normalizeProductName(notification.product), dateKey, 1)
  }

  for (const day of dispatchTrend.value) {
    const missingCount = Math.max(day.dispatch_count - (totalsByDate.get(day.date) || 0), 0)
    if (missingCount > 0) {
      addProductCount('未标记商品', day.date, missingCount)
    }
  }

  const max = dispatchChartMax.value
  return dispatchTrend.value.map((day) => ({
    date: day.date,
    label: formatDateLabel(day.date),
    total: day.dispatch_count,
    heightPercent: day.dispatch_count > 0 ? (day.dispatch_count / max) * 100 : 0,
    segments: productOrder.map((product, index) => {
      const count = countsByProduct.get(product)?.get(day.date) || 0
      return {
        product,
        count,
        color: dispatchProductColors[index % dispatchProductColors.length],
        heightPercent: day.dispatch_count > 0 ? (count / day.dispatch_count) * 100 : 0,
        title: `${product}：${count} 单`,
      }
    }).filter((segment) => segment.count > 0),
  }))
}

function showDispatchChartTooltip(event: Event, segment: DispatchChartBarSegment, bar: DispatchChartBar) {
  const target = event.currentTarget as HTMLElement | null
  const chart = target?.closest('.dispatch-native-chart') as HTMLElement | null
  const chartRect = chart?.getBoundingClientRect()
  const targetRect = target?.getBoundingClientRect()
  const pointerEvent = event as PointerEvent
  let x = targetRect ? targetRect.left + targetRect.width / 2 : 0
  let y = targetRect ? targetRect.top : 0

  if (typeof pointerEvent.clientX === 'number' && pointerEvent.clientX > 0) {
    x = pointerEvent.clientX
    y = pointerEvent.clientY
  }

  if (chartRect) {
    const horizontalPadding = 76
    const minX = Math.min(horizontalPadding, chartRect.width / 2)
    const maxX = Math.max(minX, chartRect.width - horizontalPadding)
    dispatchChartTooltip.x = Math.min(Math.max(x - chartRect.left, minX), maxX)
    dispatchChartTooltip.y = Math.max(y - chartRect.top, 28)
  } else {
    dispatchChartTooltip.x = x
    dispatchChartTooltip.y = y
  }

  dispatchChartTooltip.product = segment.product
  dispatchChartTooltip.date = bar.label
  dispatchChartTooltip.count = segment.count
  dispatchChartTooltip.visible = true
}

function hideDispatchChartTooltip() {
  dispatchChartTooltip.visible = false
}

function toggleExpand(ruleId: string) {
  if (expandingProduct.value === ruleId) { expandingProduct.value = null }
  else {
    expandingProduct.value = ruleId; pauseForm.reason = ''
    const p = products.value.find((pp) => pp.rule_id === ruleId)
    if (p?.reason) pauseForm.reason = p.reason
  }
}

function toggleEnabledProductsCollapse() {
  if (hasProductSearch.value) {
    return
  }
  enabledProductsCollapseTouched.value = true
  enabledProductsCollapsed.value = !isEnabledProductsCollapsed.value
  if (!enabledProductsCollapsed.value) {
    void nextTick(observeProductCards)
  }
}

function selectedBulkProducts(mode: BulkAvailabilityMode) {
  return mode === 'pause' ? enabledProducts.value : disabledProducts.value
}

function openBulkAvailabilityDialog(mode: BulkAvailabilityMode) {
  if (bulkAvailabilityProgress.processing) {
    return
  }
  const selectedProducts = selectedBulkProducts(mode)
  if (selectedProducts.length === 0) {
    return
  }
  bulkAvailabilityDialog.open = true
  bulkAvailabilityDialog.mode = mode
  bulkAvailabilityDialog.reason = mode === 'pause' ? '库存盘点' : ''
  bulkAvailabilityProgress.current = 0
  bulkAvailabilityProgress.total = selectedProducts.length
}

function closeBulkAvailabilityDialog() {
  if (bulkAvailabilityProgress.processing) {
    return
  }
  bulkAvailabilityDialog.open = false
}

function startBulkAvailabilityProgress(total: number) {
  stopBulkAvailabilityProgress()
  bulkAvailabilityProgress.processing = true
  bulkAvailabilityProgress.current = 0
  bulkAvailabilityProgress.total = total
  bulkAvailabilityProgressTimer = setInterval(() => {
    if (bulkAvailabilityProgress.current < Math.max(total - 1, 0)) {
      bulkAvailabilityProgress.current += 1
    }
  }, 140)
}

function stopBulkAvailabilityProgress() {
  if (bulkAvailabilityProgressTimer) {
    clearInterval(bulkAvailabilityProgressTimer)
    bulkAvailabilityProgressTimer = null
  }
}

function replaceProducts(updatedProducts: MerchantProduct[]) {
  if (updatedProducts.length === 0) {
    return
  }
  const updatedMap = new Map(updatedProducts.map((product) => [product.rule_id, product]))
  products.value = products.value.map((product) => updatedMap.get(product.rule_id) || product)
}

async function confirmBulkAvailability() {
  const mode = bulkAvailabilityDialog.mode
  const selectedProducts = selectedBulkProducts(mode)
  const ruleIds = selectedProducts.map((product) => product.rule_id)
  if (ruleIds.length === 0) {
    bulkAvailabilityDialog.open = false
    return
  }

  error.value = ''
  startBulkAvailabilityProgress(ruleIds.length)
  try {
    const available = mode === 'resume'
    const reason = mode === 'pause' ? bulkAvailabilityDialog.reason.trim() || '库存盘点' : undefined
    const result = await api.bulkUpdateAvailability(ruleIds, available, reason)
    replaceProducts(result.items)
    bulkAvailabilityProgress.current = result.success_count + result.failed_count
    if (result.failed_count > 0) {
      error.value = `已成功 ${result.success_count} 件，失败 ${result.failed_count} 件，请稍后重试`
    }
    bulkAvailabilityDialog.open = false
    expandingProduct.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '批量操作失败'
  } finally {
    stopBulkAvailabilityProgress()
    bulkAvailabilityProgress.processing = false
  }
}

async function setAvailable(ruleId: string) {
  submittingProduct.value = ruleId
  try {
    const updated = await api.updateAvailability(ruleId, true)
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) products.value[idx] = updated
    expandingProduct.value = null
  } catch (err) { error.value = err instanceof Error ? err.message : '操作失败' }
  finally { submittingProduct.value = null }
}

async function setUnavailable(ruleId: string) {
  submittingProduct.value = ruleId
  try {
    const updated = await api.updateAvailability(ruleId, false, pauseForm.reason || undefined)
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) products.value[idx] = updated
    expandingProduct.value = null
  } catch (err) { error.value = err instanceof Error ? err.message : '操作失败' }
  finally { submittingProduct.value = null }
}

function logout(reason: LogoutReason = 'manual') {
  const notice = getLogoutNotice(reason)
  token.value = ''
  clearAuthTokenStorage()
  forcePasswordChange.value = false
  pendingPasswordChangeToken.value = ''
  loginForm.password = ''
  passwordChangeForm.newUsername = ''
  passwordChangeForm.newPassword = ''
  passwordChangeForm.confirmPassword = ''
  passwordVisibility.loginPassword = false
  passwordVisibility.newPassword = false
  passwordVisibility.confirmPassword = false
  bulkAvailabilityDialog.open = false
  bulkAvailabilityDialog.mode = 'pause'
  bulkAvailabilityDialog.reason = '库存盘点'
  bulkAvailabilityProgress.processing = false
  bulkAvailabilityProgress.current = 0
  bulkAvailabilityProgress.total = 0
  stopBulkAvailabilityProgress()
  saveMerchantSession(null)
  api.setToken(''); products.value = []
  notifications.value = []
  dispatchTrend.value = []
  notificationsSummary.today_count = 0
  notificationsSummary.unread_count = 0
  knownNotificationIds.value = new Set()
  localReadNotificationIds.value = new Set()
  clearNotificationHighlightTimers()
  notificationsLoaded.value = false
  newDispatchBurstCount.value = 0
  stopNotificationsPolling()
  expandingProduct.value = null; pauseForm.reason = ''
  navActive.value = 'dashboard'
  error.value = ''
  sessionNotice.value = notice
}

function getLogoutNotice(reason: LogoutReason) {
  if (reason === 'expired') {
    return '登录已过期，请重新登录'
  }
  if (reason === 'password-reset-cancelled') {
    return '已返回登录，请重新输入商户账号和密码'
  }
  return '已安全退出登录'
}

function readStoredAuthToken() {
  const nextToken = sessionStorage.getItem(AUTH_TOKEN_KEY) || ''
  localStorage.removeItem(AUTH_TOKEN_KEY)
  return nextToken
}

function persistAuthToken(nextToken: string) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, nextToken)
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

function clearAuthTokenStorage() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

function readRememberDevicePreference() {
  return localStorage.getItem(REMEMBER_DEVICE_KEY) === '1'
}

function readRememberedUsername() {
  return localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
}

function persistRememberedLogin(username: string) {
  if (rememberDevice.value) {
    localStorage.setItem(REMEMBER_DEVICE_KEY, '1')
    localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
    return
  }
  localStorage.removeItem(REMEMBER_DEVICE_KEY)
  localStorage.removeItem(REMEMBERED_USERNAME_KEY)
}

function readStoredMerchantSession(): MerchantSession | null {
  try {
    const raw = localStorage.getItem('merchant_profile')
    if (!raw) {
      return null
    }
    return extractMerchantSession(JSON.parse(raw))
  } catch {
    return null
  }
}

function saveMerchantSession(session: MerchantSession | null) {
  merchantSession.value = session
  if (!session) {
    localStorage.removeItem('merchant_profile')
    return
  }
  localStorage.setItem('merchant_profile', JSON.stringify(session))
}

function formatTime(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDispatchTime(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function relativeTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '--'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return formatTime(value)
}

async function run(task: () => Promise<void>) {
  loading.value = true; error.value = ''; sessionNotice.value = ''
  try {
    await task()
  } catch (err) {
    if (err instanceof ApiError && err.message === '登录已过期，请重新登录') {
      sessionNotice.value = err.message
      error.value = ''
      return
    }
    error.value = err instanceof Error ? err.message : '请求失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="shell">
    <!-- Sidebar -->
    <aside class="sidebar" v-if="isLoggedIn">
      <div class="sidebar-brand">
        <div class="sidebar-brand-copy"><strong>商户管理</strong><span>库存接单控制</span></div>
        <div class="sidebar-brand-user" v-if="isLoggedIn">
          <strong>{{ merchantLabel }}</strong>
          <span>{{ accountLabel }}</span>
        </div>
        <button class="sidebar-brand-logout" v-if="isLoggedIn" @click="logout('manual')">退出登录</button>
      </div>
      <nav class="sidebar-nav" v-if="isLoggedIn">
        <span class="nav-active-indicator" :style="{ '--nav-active-index': navActiveIndex }" aria-hidden="true"></span>
        <button :class="{ active: navActive === 'dashboard' }" @click="navActive = 'dashboard'">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          仪表盘
        </button>
        <button :class="{ active: navActive === 'products' }" @click="navActive = 'products'">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          商品管理
        </button>
        <button :class="{ active: navActive === 'notifications' }" @click="goToNotifications">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          历史派单
          <span v-if="navUnreadCount > 0" class="nav-badge">
            {{ navUnreadCount > 99 ? '99+' : navUnreadCount }}
          </span>
        </button>
      </nav>
      <div class="sidebar-user" v-if="isLoggedIn">
        <strong>{{ merchantLabel }}</strong>
        <span>{{ accountLabel }}</span>
        <button @click="logout('manual')">退出登录</button>
      </div>
    </aside>

    <!-- Main -->
    <main class="main" :class="{ 'main-login': !isLoggedIn }">
      <p v-if="error && isLoggedIn" class="alert">{{ error }}</p>

      <!-- Login -->
      <section v-if="!isLoggedIn" class="login-shell">
        <div class="login-form-panel">
          <div class="login-card">
            <template v-if="forcePasswordChange">
              <div class="login-form-copy">
                <p class="login-eyebrow">账号安全</p>
                <h1>设置新账号和新密码</h1>
                <p>管理员已重置你的账号。请先设置正式登录账号和新密码，临时账号完成后将不能再使用。</p>
              </div>
              <p v-if="error" class="alert login-alert">{{ error }}</p>
              <p v-if="sessionNotice && !error" class="login-notice">{{ sessionNotice }}</p>
              <div class="field">
                <label>新登录账号</label>
                <input
                  v-model="passwordChangeForm.newUsername"
                  placeholder="请输入正式商户登录账号"
                  autocomplete="username"
                />
              </div>
              <div class="field">
                <label>新密码</label>
                <div class="password-input-wrap">
                  <input
                    v-model="passwordChangeForm.newPassword"
                    :type="passwordVisibility.newPassword ? 'text' : 'password'"
                    placeholder="请输入至少 6 位新密码"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-label="passwordVisibility.newPassword ? '隐藏新密码' : '查看新密码'"
                    :aria-pressed="passwordVisibility.newPassword"
                    @click="passwordVisibility.newPassword = !passwordVisibility.newPassword"
                  >
                    <svg
                      class="password-toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.6" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="field">
                <label>确认新密码</label>
                <div class="password-input-wrap">
                  <input
                    v-model="passwordChangeForm.confirmPassword"
                    :type="passwordVisibility.confirmPassword ? 'text' : 'password'"
                    placeholder="请再次输入新密码"
                    autocomplete="new-password"
                    @keyup.enter="completePasswordChange"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-label="passwordVisibility.confirmPassword ? '隐藏确认新密码' : '查看确认新密码'"
                    :aria-pressed="passwordVisibility.confirmPassword"
                    @click="passwordVisibility.confirmPassword = !passwordVisibility.confirmPassword"
                  >
                    <svg
                      class="password-toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.6" />
                    </svg>
                  </button>
                </div>
              </div>
              <button class="btn btn-primary login-submit" :disabled="loading" @click="completePasswordChange">
                <span v-if="loading" class="login-spinner" aria-hidden="true"></span>
                {{ loading ? '提交中...' : '确认并返回登录' }}
              </button>
              <button class="btn btn-outline login-secondary" :disabled="loading" @click="logout('password-reset-cancelled')">返回登录</button>
            </template>
            <template v-else>
              <div class="login-form-copy">
                <h1>商户控制台</h1>
                <p>查看派单通知，管理商品接单状态</p>
              </div>
              <p v-if="error" class="alert login-alert">{{ error }}</p>
              <p v-if="sessionNotice && !error" class="login-notice">{{ sessionNotice }}</p>
              <div class="field">
                <label>商户账号</label>
                <input v-model="loginForm.username" placeholder="请输入商户账号" autocomplete="username" />
              </div>
              <div class="field">
                <label>密码</label>
                <div class="password-input-wrap">
                  <input
                    v-model="loginForm.password"
                    :type="passwordVisibility.loginPassword ? 'text' : 'password'"
                    placeholder="请输入密码"
                    autocomplete="current-password"
                    @keyup.enter="login"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-label="passwordVisibility.loginPassword ? '隐藏密码' : '查看密码'"
                    :aria-pressed="passwordVisibility.loginPassword"
                    @click="passwordVisibility.loginPassword = !passwordVisibility.loginPassword"
                  >
                    <svg
                      class="password-toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.6" />
                    </svg>
                  </button>
                </div>
              </div>
              <label class="remember-device">
                <input v-model="rememberDevice" type="checkbox" />
                <span>
                  <strong>记住此设备</strong>
                  <small>下次自动填入商户账号</small>
                </span>
              </label>
              <button class="btn btn-primary login-submit" :disabled="loading" @click="login">
                <span v-if="loading" class="login-spinner" aria-hidden="true"></span>
                {{ loading ? '登录中...' : '登录' }}
              </button>
            </template>
          </div>
        </div>
      </section>

      <template v-if="isLoggedIn">
        <!-- Dashboard -->
        <template v-if="navActive === 'dashboard'">
          <div class="welcome">
            <SplitRevealText
              :text="`👋 欢迎回来，${merchantLabel}`"
              tag="h1"
              class-name="welcome-title"
              :delay="34"
              :duration="0.86"
            />
            <SplitRevealText
              text="实时查看库存状态，收到新订单时请及时确认接单。"
              tag="p"
              class-name="welcome-subtitle"
              :delay="18"
              :duration="0.72"
              root-margin="-12px"
            />
          </div>

          <div class="stats-row">
            <div
              class="stat-card stat-card-today"
              data-dashboard-card-id="stat-today"
              style="--dashboard-card-delay: 0ms"
              :class="['dashboard-card', { 'in-view': visibleDashboardCardIds.has('stat-today') }]"
            >
              <div class="stat-label">今日总单量</div>
              <div class="stat-value green">{{ todayAssigned }}</div>
              <div class="stat-sub">来自今日派单记录</div>
            </div>
            <div
              class="stat-card stat-card-online"
              data-dashboard-card-id="stat-online"
              style="--dashboard-card-delay: 80ms"
              :class="['dashboard-card', { 'in-view': visibleDashboardCardIds.has('stat-online') }]"
            >
              <div class="stat-label">在线商品</div>
              <div class="stat-value ink">{{ onlineCount }}</div>
              <div class="stat-sub">共 {{ products.length }} 个商品</div>
            </div>
            <div
              class="stat-card stat-card-paused"
              data-dashboard-card-id="stat-paused"
              style="--dashboard-card-delay: 160ms"
              :class="['dashboard-card', { 'in-view': visibleDashboardCardIds.has('stat-paused') }]"
            >
              <div class="stat-label">已暂停</div>
              <div class="stat-value warn">{{ pendingCount }}</div>
              <div class="stat-sub">待恢复接单</div>
            </div>
          </div>

          <div
            class="notif-panel"
            data-dashboard-card-id="notifications"
            style="--dashboard-card-delay: 220ms"
            :class="['dashboard-card', { 'in-view': visibleDashboardCardIds.has('notifications') }]"
          >
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              通知中心 {{ dashboardNotifications.length ? ` · ${dashboardNotifications.length} 条` : '' }} {{ notifOpen ? '' : '(已收起)' }}
              <button class="btn btn-ghost" style="margin-left:auto" @click="notifOpen = !notifOpen">{{ notifOpen ? '收起' : '展开' }}</button>
            </h2>
            <Transition name="notif-collapse">
              <div class="notif-list" v-if="notifOpen">
                <div v-if="dashboardNotifications.length === 0" class="notif-empty">近 2 小时暂无新派单通知。新派单分配后将在此显示提醒。</div>
                <button v-if="newDispatchBurstCount > 3" class="dispatch-burst" @click="goToNotifications">
                  刚收到 {{ newDispatchBurstCount }} 条新派单，前往通知页查看
                </button>
                <TransitionGroup name="notif-row-slide" tag="div" class="notif-rows">
                  <div
                    v-for="notification in recentNotifications"
                    :key="notification.id"
                    :class="['notif-row', { 'notif-row-new': highlightedNotificationIds.has(notification.id) }]"
                  >
                    <div class="notif-text">
                      <strong>{{ notification.product || '新派单' }}</strong>
                      <span>{{ notification.order_title }}</span>
                      <small v-if="notification.order_no">订单号：{{ notification.order_no }}</small>
                    </div>
                    <button class="notif-read-btn" @click="markNotificationRead(notification.id)">已读</button>
                  </div>
                </TransitionGroup>
                <button v-if="hasMoreNotifications" class="notif-more" @click="goToNotifications">
                  查看全部 {{ dashboardNotifications.length }} 条派单记录
                </button>
              </div>
            </Transition>
          </div>

          <div
            class="dispatch-chart-panel"
            data-dashboard-card-id="dispatch-chart"
            style="--dashboard-card-delay: 280ms"
            :class="['dashboard-card', { 'in-view': visibleDashboardCardIds.has('dispatch-chart') }]"
          >
            <div class="dispatch-chart-header">
              <div>
                <h2>近 7 天派单趋势</h2>
                <p>按商品拆分被派单数</p>
              </div>
              <button class="btn btn-ghost" @click="goToNotifications">查看明细</button>
            </div>
            <div v-if="dispatchTrendTotal === 0" class="notif-empty">近 7 天暂无派单数据</div>
            <div
              v-else
              class="dispatch-native-chart"
              role="img"
              aria-label="近 7 天派单趋势"
              @pointerleave="hideDispatchChartTooltip"
              @click.self="hideDispatchChartTooltip"
            >
              <div class="dispatch-chart-plot">
                <div class="dispatch-chart-grid" aria-hidden="true">
                  <div v-for="line in dispatchChartGridLines" :key="line" class="dispatch-chart-grid-line">
                    <span>{{ line }}</span>
                  </div>
                </div>
                <div class="dispatch-chart-bars">
                  <div v-for="bar in dispatchChartBars" :key="bar.date" class="dispatch-bar-group">
                    <div class="dispatch-bar-track">
                      <div class="dispatch-bar-stack" :style="{ height: `${bar.heightPercent}%` }">
                        <span
                          v-for="segment in bar.segments"
                          :key="`${bar.date}-${segment.product}`"
                          class="dispatch-bar-segment"
                          role="button"
                          tabindex="0"
                          :aria-label="segment.title"
                          :style="{ height: `${segment.heightPercent}%`, background: segment.color }"
                          @pointerenter="showDispatchChartTooltip($event, segment, bar)"
                          @pointermove="showDispatchChartTooltip($event, segment, bar)"
                          @focus="showDispatchChartTooltip($event, segment, bar)"
                          @blur="hideDispatchChartTooltip"
                          @click.stop="showDispatchChartTooltip($event, segment, bar)"
                        ></span>
                      </div>
                    </div>
                    <div class="dispatch-bar-label">{{ bar.label }}</div>
                  </div>
                </div>
              </div>
              <div
                v-if="dispatchChartTooltip.visible"
                class="dispatch-chart-tooltip"
                :style="{ left: `${dispatchChartTooltip.x}px`, top: `${dispatchChartTooltip.y}px` }"
              >
                <strong>{{ dispatchChartTooltip.product }}</strong>
                <span>{{ dispatchChartTooltip.date }} · {{ dispatchChartTooltip.count }} 单</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Products -->
        <template v-if="navActive === 'products'">
          <div class="product-section">
            <div class="product-header">
              <div>
                <h2>商品管理</h2>
                <p style="margin-top:4px;color:var(--body);font-size:13px">切换商品的接单状态，暂停的商品不会被派单。</p>
              </div>
              <div class="product-toolbar">
                <div class="product-search">
                  <input v-model="productSearch" placeholder="搜索商品..." />
                </div>
                <button
                  class="btn btn-outline"
                  :disabled="bulkAvailabilityProgress.processing || enabledProducts.length === 0"
                  @click="openBulkAvailabilityDialog('pause')"
                >
                  <template v-if="bulkAvailabilityProgress.processing && bulkAvailabilityDialog.mode === 'pause'">
                    处理中 {{ bulkAvailabilityProgress.current }}/{{ bulkAvailabilityProgress.total }}
                  </template>
                  <template v-else>一键暂停全部</template>
                </button>
                <button
                  class="btn btn-primary"
                  :disabled="bulkAvailabilityProgress.processing || disabledProducts.length === 0"
                  @click="openBulkAvailabilityDialog('resume')"
                >
                  <template v-if="bulkAvailabilityProgress.processing && bulkAvailabilityDialog.mode === 'resume'">
                    处理中 {{ bulkAvailabilityProgress.current }}/{{ bulkAvailabilityProgress.total }}
                  </template>
                  <template v-else>一键恢复全部</template>
                </button>
              </div>
            </div>

            <div v-if="filteredEnabled.length > 0" class="product-group">
              <div class="product-group-header">
                <div class="product-group-label">可接单 · {{ filteredEnabled.length }}</div>
                <button
                  class="btn btn-ghost product-group-toggle"
                  :disabled="hasProductSearch"
                  @click="toggleEnabledProductsCollapse"
                >
                  {{ hasProductSearch ? '搜索中展开' : isEnabledProductsCollapsed ? '展开' : '收起' }}
                </button>
              </div>
              <button v-if="isEnabledProductsCollapsed" class="product-collapse-summary" type="button" @click="toggleEnabledProductsCollapse">
                <strong>正在接单 {{ filteredEnabled.length }} 件</strong>
                <span>点击展开查看可接单商品</span>
              </button>
              <Transition name="product-collapse">
                <div v-if="!isEnabledProductsCollapsed" class="product-grid">
                  <div v-for="p in filteredEnabled" :key="p.rule_id" class="product-card-stack">
                    <div
                      class="product-card"
                      :data-rule-id="p.rule_id"
                      :class="{
                        expanded: expandingProduct === p.rule_id,
                        'in-view': visibleProductCardIds.has(p.rule_id),
                        'scroll-return': returningProductCardIds.has(p.rule_id),
                      }"
                    >
                      <div class="product-card-main">
                        <div class="product-card-name">{{ p.product }}</div>
                        <div class="product-card-meta">状态更新：{{ relativeTime(p.updated_at) }}</div>
                      </div>
                      <span class="status-badge active">正在接单</span>
                      <button class="btn btn-outline" :disabled="submittingProduct === p.rule_id" @click="toggleExpand(p.rule_id)">
                        {{ expandingProduct === p.rule_id ? '取消' : '暂停接单' }}
                      </button>
                    </div>
                    <div v-if="expandingProduct === p.rule_id" class="pause-form">
                      <label>暂停原因（选填）</label>
                      <textarea v-model="pauseForm.reason" placeholder="例如：无库存、设备维修" />
                      <div class="pause-form-actions">
                        <button class="btn btn-outline" @click="expandingProduct = null">取消</button>
                        <button class="btn btn-primary" :disabled="submittingProduct === expandingProduct" @click="setUnavailable(expandingProduct!)">确认暂停</button>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <div v-if="filteredDisabled.length > 0" class="product-group">
              <div class="product-group-label">已暂停 · {{ filteredDisabled.length }}</div>
              <div class="product-grid">
                <div
                  v-for="p in filteredDisabled"
                  :key="p.rule_id"
                  class="product-card"
                  :data-rule-id="p.rule_id"
                  :class="{
                    'in-view': visibleProductCardIds.has(p.rule_id),
                    'scroll-return': returningProductCardIds.has(p.rule_id),
                  }"
                >
                  <div class="product-card-main">
                    <div class="product-card-name">{{ p.product }}</div>
                    <div class="product-card-meta">暂停原因：{{ p.reason || '无库存' }} · 状态更新：{{ relativeTime(p.updated_at) }}</div>
                  </div>
                  <span class="status-badge paused">已暂停</span>
                  <button class="btn btn-primary" :disabled="submittingProduct === p.rule_id" @click="setAvailable(p.rule_id)">恢复接单</button>
                </div>
              </div>
            </div>

            <div v-if="products.length === 0" class="empty-state">
              <h3>暂无商品</h3>
              <p>平台尚未为您分配任何商品权限，请联系管理员。</p>
            </div>
          </div>
        </template>

        <div v-if="bulkAvailabilityDialog.open" class="bulk-dialog-backdrop">
          <div class="bulk-dialog-card">
            <h2>{{ bulkAvailabilityDialog.mode === 'pause' ? '确认暂停全部接单？' : '确认恢复全部接单？' }}</h2>
            <p>
              {{
                bulkAvailabilityDialog.mode === 'pause'
                  ? `将暂停当前正在接单的 ${bulkAvailabilityProgress.total} 件商品，暂停后不会被派单。`
                  : `将恢复当前已暂停的 ${bulkAvailabilityProgress.total} 件商品，恢复后可以继续被派单。`
              }}
            </p>
            <div v-if="bulkAvailabilityDialog.mode === 'pause'" class="field">
              <label>暂停原因</label>
              <input
                v-model="bulkAvailabilityDialog.reason"
                placeholder="例如：库存盘点"
                :disabled="bulkAvailabilityProgress.processing"
              />
            </div>
            <div v-if="bulkAvailabilityProgress.processing" class="bulk-progress">
              处理中 {{ bulkAvailabilityProgress.current }}/{{ bulkAvailabilityProgress.total }}
            </div>
            <div class="bulk-dialog-actions">
              <button class="btn btn-outline" :disabled="bulkAvailabilityProgress.processing" @click="closeBulkAvailabilityDialog">取消</button>
              <button class="btn btn-primary" :disabled="bulkAvailabilityProgress.processing" @click="confirmBulkAvailability">
                {{ bulkAvailabilityDialog.mode === 'pause' ? '确认暂停全部' : '确认恢复全部' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Notifications -->
        <template v-if="navActive === 'notifications'">
          <div class="welcome">
            <h1>派单记录</h1>
            <p>查看近期自己被派单的完整数据。</p>
          </div>
          <div class="dispatch-record-panel">
            <div v-if="notifications.length === 0" class="notif-empty">暂无新通知。</div>
            <div v-else>
              <div class="dispatch-record-table-wrap">
                <table class="dispatch-record-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>商品</th>
                      <th>订单号</th>
                      <th>订单标题</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="notification in notifications" :key="notification.id">
                      <td>{{ formatDispatchTime(notification.assigned_at) }}</td>
                      <td>{{ dash(notification.product) }}</td>
                      <td>{{ dash(notification.order_no) }}</td>
                      <td class="dispatch-title-cell">{{ dash(notification.order_title) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="dispatch-record-cards">
                <div v-for="notification in notifications" :key="notification.id" class="dispatch-record-card">
                  <div class="dispatch-record-card-head">
                    <strong>{{ dash(notification.product) }}</strong>
                    <span>{{ formatDispatchTime(notification.assigned_at) }}</span>
                  </div>
                  <p>{{ dash(notification.order_title) }}</p>
                  <div class="dispatch-record-card-meta">
                    <span>订单号：{{ dash(notification.order_no) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </main>
  </div>
</template>
