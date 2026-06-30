<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  ApiError,
  api,
  type LoginResponse,
  type MerchantFeedbackRecord,
  type MerchantFeedbackType,
  type MerchantIssueType,
  type MerchantNotification,
  type MerchantNotificationTrendDay,
  type MerchantPriceIssueType,
  type MerchantInventoryLatestItem,
  type MerchantInventoryOption,
  type MerchantProductApplicationOption,
  type MerchantProductApplicationRecord,
  type MerchantProduct,
} from './api'
import {
  decodeTokenClaims,
  extractMerchantSession,
  getMerchantIdentityFromSession,
  type MerchantSession,
} from './auth'
import SplitRevealText from './components/SplitRevealText.vue'
import { buildInventorySnapshotPayload, hasValidInventorySnapshotQuantities } from './inventory'
import { getRecentUnreadNotifications } from './notifications'
import {
  PREVIEW_INVENTORY_OPTIONS,
  PREVIEW_LATEST_INVENTORY,
  PREVIEW_MERCHANT_SESSION,
  PREVIEW_NOTIFICATIONS_RESPONSE,
  PREVIEW_PRODUCTS,
  PREVIEW_TOKEN,
  createPreviewFeedbackRecord,
  createPreviewProductApplicationRecord,
  isLocalPreviewMode,
} from './preview'

type BulkAvailabilityMode = 'pause' | 'resume'
type PauseResumeMode = 'scheduled' | 'manual'
type LogoutReason = 'manual' | 'expired' | 'password-reset-cancelled'
type FeedbackCenterMode = 'product_application' | 'feedback'
type InventorySourceType = 'owned' | 'catalog'

interface SubmissionRecord {
  id: string
  typeText: string
  title: string
  summary: string
  status: string
  statusText: string
  createdAt: string
}

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

interface InventoryDraftRow {
  key: string
  source_type: InventorySourceType
  rule_id: string
  product: string
  quantity: string
  latestQuantity: number | null
  has_active_application: boolean
}

const AUTH_TOKEN_KEY = 'merchant_token'
const REMEMBER_DEVICE_KEY = 'merchant_remember_device'
const REMEMBERED_USERNAME_KEY = 'merchant_remembered_username'
const previewMode = isLocalPreviewMode(
  import.meta.env.DEV,
  typeof window === 'undefined' ? '' : window.location.search,
)

const token = ref(previewMode ? PREVIEW_TOKEN : readStoredAuthToken())
const merchantSession = ref<MerchantSession | null>(previewMode ? PREVIEW_MERCHANT_SESSION : readStoredMerchantSession())
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
const feedbackRecords = ref<MerchantFeedbackRecord[]>([])
const productApplicationOptions = ref<MerchantProductApplicationOption[]>([])
const productApplicationSearchInput = ref('')
const productApplicationSearchQuery = ref('')
const productApplicationPickerOpen = ref(false)
const mobilePickerMode = ref(false)
const productApplicationRecords = ref<MerchantProductApplicationRecord[]>([])
const submissionRecordsExpanded = ref(false)
const feedbackPanelExpanded = ref(false)
const feedbackCenterMode = ref<FeedbackCenterMode>('product_application')
const feedbackMode = ref<MerchantFeedbackType>('price_suggestion')
const priceProductPickerOpen = ref(false)
const feedbackLoading = ref(false)
const feedbackSubmitting = ref(false)
const productApplicationOptionsLoading = ref(false)
const productApplicationSubmitting = ref(false)
const feedbackNotice = ref('')
const feedbackError = ref('')
const inventoryOptions = reactive<{ owned: MerchantInventoryOption[]; catalog: MerchantInventoryOption[] }>({
  owned: [],
  catalog: [],
})
const latestInventoryItems = ref<MerchantInventoryLatestItem[]>([])
const inventoryRows = ref<InventoryDraftRow[]>([])
const inventorySearch = ref('')
const inventoryLoading = ref(false)
const inventoryLoaded = ref(false)
const inventorySubmitting = ref(false)
const inventoryNotice = ref('')
const inventoryError = ref('')
const existingProductApplicationForm = reactive({
  productId: '',
  reason: '',
})
const newProductApplicationForm = reactive({
  product: '',
  modelNote: '',
  reason: '',
})
const issueFeedbackForm = reactive({
  issueType: 'page' as MerchantIssueType,
  description: '',
})
const priceFeedbackForm = reactive({
  product: '',
  ruleId: '',
  priceIssueType: 'price_unreasonable' as MerchantPriceIssueType,
  pricePerDay: '',
  reason: '',
})
const issueFeedbackOptions: Array<{ value: MerchantIssueType; label: string }> = [
  { value: 'page', label: '页面异常' },
  { value: 'dispatch', label: '派单异常' },
  { value: 'product', label: '接单状态异常' },
  { value: 'account', label: '登录账号问题' },
  { value: 'other', label: '其他' },
]
const priceIssueFeedbackOptions: Array<{ value: MerchantPriceIssueType; label: string }> = [
  { value: 'price_unreasonable', label: '推荐价格不合理' },
  { value: 'wrong_model', label: '商品型号不准' },
  { value: 'other', label: '其他' },
]
const expandingProduct = ref<string | null>(null)
const pauseForm = reactive({ resumeAt: '', resumeMode: 'scheduled' as PauseResumeMode })
const submittingProduct = ref<string | null>(null)
const bulkAvailabilityDialog = reactive({
  open: false,
  mode: 'pause' as BulkAvailabilityMode,
  resumeMode: 'scheduled' as PauseResumeMode,
  resumeAt: '',
})
const bulkAvailabilityProgress = reactive({ processing: false, current: 0, total: 0 })
const navActive = ref(previewMode ? 'machineInventory' : 'dashboard')
const notifOpen = ref(true)
const visibleProductCardIds = ref<Set<string>>(new Set())
const visibleDashboardCardIds = ref<Set<string>>(new Set())
const productCardsInViewportIds = ref<Set<string>>(new Set())
const returningProductCardIds = ref<Set<string>>(new Set())
let productCardsObserver: IntersectionObserver | null = null
let mobilePickerMediaQuery: MediaQueryList | null = null
const productCardReturnTimers = new Map<string, ReturnType<typeof setTimeout>>()
const notificationHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>()
let bulkAvailabilityProgressTimer: ReturnType<typeof setInterval> | null = null
let productApplicationPickerCloseTimer: ReturnType<typeof setTimeout> | null = null
let priceProductPickerCloseTimer: ReturnType<typeof setTimeout> | null = null

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
const bulkAvailabilityDialogDescription = computed(() => {
  if (bulkAvailabilityDialog.mode === 'resume') {
    return `将恢复当前已暂停的 ${bulkAvailabilityProgress.total} 件商品，恢复后可以继续被派单。`
  }
  if (bulkAvailabilityDialog.resumeMode === 'manual') {
    return `将暂停当前正在接单的 ${bulkAvailabilityProgress.total} 件商品，商户需要在已暂停区域手动恢复接单。`
  }
  return `将暂停当前正在接单的 ${bulkAvailabilityProgress.total} 件商品，系统会在设置时间后自动恢复接单。`
})
const dashboardNotifications = computed(() => getRecentUnreadNotifications(
  notifications.value,
  { localReadIds: localReadNotificationIds.value },
))
const navUnreadCount = computed(() => navActive.value === 'notifications' ? 0 : dashboardNotifications.value.length)
const navActiveIndex = computed(() => ({ dashboard: 0, products: 1, machineInventory: 2, notifications: 3 }[navActive.value] ?? 0))
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
let productsTimer: ReturnType<typeof setInterval> | null = null
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
const latestInventoryMap = computed(() =>
  new Map(latestInventoryItems.value.map((item) => [item.rule_id, item]))
)
const inventorySelectedRuleIds = computed(() => new Set(inventoryRows.value.map((row) => row.rule_id)))
const inventoryRowByRuleId = computed(() =>
  new Map(inventoryRows.value.map((row) => [row.rule_id, row]))
)
const inventoryOptionPool = computed(() => [...inventoryOptions.owned, ...inventoryOptions.catalog])
const inventoryOptionByRuleId = computed(() =>
  new Map(inventoryOptionPool.value.map((option) => [option.rule_id, option]))
)
const selectedInventoryOptions = computed(() =>
  inventoryRows.value.map((row) => inventoryOptionByRuleId.value.get(row.rule_id) || ({
    source_type: row.source_type,
    rule_id: row.rule_id,
    product: row.product,
    keywords: [],
    category: null,
    available: row.source_type === 'owned' ? true : null,
    has_active_application: row.has_active_application,
    latest_quantity: row.latestQuantity,
  }))
)
const inventorySearchDraftName = computed(() => inventorySearch.value.trim())
const filteredInventoryOptions = computed(() => {
  const keyword = inventorySearchDraftName.value.toLowerCase()
  const rows = inventoryOptionPool.value
  if (!keyword) return rows
  return rows.filter((option) => {
    const haystack = [
      option.product,
      option.category || '',
      ...(option.keywords || []),
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
})
const filteredInventoryOptionRows = computed(() => {
  const selectedRuleIds = inventorySelectedRuleIds.value
  const options = [
    ...selectedInventoryOptions.value,
    ...filteredInventoryOptions.value.filter((option) => !selectedRuleIds.has(option.rule_id)),
  ]
  return options.map((option) => ({
    option,
    row: inventoryRowByRuleId.value.get(option.rule_id) || null,
  }))
})
const inventorySearchHasNoMatches = computed(() =>
  Boolean(inventorySearchDraftName.value) && filteredInventoryOptions.value.length === 0
)
const inventoryShouldShowEmptyState = computed(() =>
  inventorySearchHasNoMatches.value || filteredInventoryOptionRows.value.length === 0
)
const inventoryCanSubmit = computed(() =>
  inventoryRows.value.length > 0 && hasValidInventorySnapshotQuantities(inventoryRows.value)
)
const inventorySubmitDisabled = computed(() =>
  inventorySubmitting.value || !inventoryCanSubmit.value
)
const feedbackProductOptions = computed(() => {
  const seen = new Set<string>()
  return products.value.filter((product) => {
    const name = product.product.trim()
    if (!name || seen.has(name)) return false
    seen.add(name)
    return true
  })
})
const filteredFeedbackProductOptions = computed(() => {
  const keyword = priceFeedbackForm.product.trim().toLowerCase()
  if (!keyword) return feedbackProductOptions.value
  return feedbackProductOptions.value.filter((product) => product.product.toLowerCase().includes(keyword))
})
const filteredProductApplicationOptions = computed(() => {
  const keyword = productApplicationSearchQuery.value.trim().toLowerCase()
  if (!keyword) return productApplicationOptions.value
  return productApplicationOptions.value.filter((option) => {
    const product = option.product.toLowerCase()
    const keywords = (option.keywords || []).join(' ').toLowerCase()
    return product.includes(keyword) || keywords.includes(keyword)
  })
})
const selectedProductApplicationOption = computed(() =>
  productApplicationOptions.value.find((option) => option.product_id === existingProductApplicationForm.productId)
)
const productApplicationDraftName = computed(() =>
  (productApplicationSearchInput.value || productApplicationSearchQuery.value).trim()
)
const productApplicationIsNew = computed(() =>
  Boolean(newProductApplicationForm.product.trim()) && !selectedProductApplicationOption.value
)
const productApplicationSelectedName = computed(() =>
  selectedProductApplicationOption.value?.product || newProductApplicationForm.product.trim()
)
const productApplicationReason = computed({
  get() {
    return productApplicationIsNew.value ? newProductApplicationForm.reason : existingProductApplicationForm.reason
  },
  set(value: string) {
    if (productApplicationIsNew.value) {
      newProductApplicationForm.reason = value
      return
    }
    existingProductApplicationForm.reason = value
  },
})
const submissionRecords = computed<SubmissionRecord[]>(() => {
  const productApplicationItems = productApplicationRecords.value.map((record) => ({
    id: `application-${record.id}`,
    typeText: productApplicationTypeText(record.application_type),
    title: record.product || '未命名商品',
    summary: productApplicationSummary(record),
    status: record.status,
    statusText: productApplicationStatusText(record.status),
    createdAt: record.created_at,
  }))
  const feedbackItems = feedbackRecords.value.map((record) => ({
    id: `feedback-${record.id}`,
    typeText: feedbackTypeText(record.type),
    title: feedbackSummary(record),
    summary: feedbackRecordDetail(record),
    status: record.status,
    statusText: feedbackStatusText(record.status),
    createdAt: record.created_at,
  }))
  return [...productApplicationItems, ...feedbackItems]
    .sort((left, right) => recordTime(right.createdAt) - recordTime(left.createdAt))
})
const hasHiddenSubmissionRecords = computed(() => submissionRecords.value.length > 0)
const visibleSubmissionRecords = computed(() =>
  submissionRecordsExpanded.value ? submissionRecords.value : submissionRecords.value.slice(0, 2)
)
const issueFeedbackHelpText = computed(() => ({
  page: '页面展示、按钮点击、数据刷新等使用异常。',
  dispatch: '派单通知、派单记录、订单分配等流程异常。',
  product: '暂停接单、恢复接单、接单状态同步等控制异常。',
  account: '登录、改密、账号显示、权限提示等账号问题。',
  other: '其他影响商户端正常使用的问题。',
})[issueFeedbackForm.issueType])
const issueFeedbackPlaceholder = computed(() => ({
  page: '例如：点击按钮没有反应，或页面数据一直不刷新。',
  dispatch: '例如：已被派单但通知没有出现，或历史派单记录缺失。',
  product: '例如：暂停/恢复接单后，状态没有同步更新。',
  account: '例如：无法登录、重置密码失败，或账号信息显示不对。',
  other: '请描述你遇到的问题、发生时间和影响范围。',
})[issueFeedbackForm.issueType])
const issueFeedbackSubmitText = computed(() => ({
  page: '提交页面反馈',
  dispatch: '提交派单反馈',
  product: '提交接单状态反馈',
  account: '提交账号反馈',
  other: '提交问题反馈',
})[issueFeedbackForm.issueType])
const priceFeedbackRequiresPrice = computed(() => priceFeedbackForm.priceIssueType === 'price_unreasonable')
const priceFeedbackReasonLabel = computed(() => {
  if (priceFeedbackForm.priceIssueType === 'wrong_model') return '正确型号说明'
  return '原因说明'
})
const priceFeedbackReasonPlaceholder = computed(() => {
  if (priceFeedbackForm.priceIssueType === 'price_unreasonable') {
    return '例如：同城同行价格在 60-70 元/天'
  }
  if (priceFeedbackForm.priceIssueType === 'wrong_model') {
    return '例如：当前商品型号应为 Pocket 3 标准版，不是 Creator Combo'
  }
  return '请说明你遇到的价格推荐相关问题'
})
const priceFeedbackSubmitText = computed(() => {
  if (priceFeedbackForm.priceIssueType === 'price_unreasonable') return '提交价格建议'
  if (priceFeedbackForm.priceIssueType === 'wrong_model') return '提交型号反馈'
  return '提交反馈'
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
  if (!merchantSession.value && !previewMode) {
    void refreshMerchantSession()
  }
  void refreshProducts()
  void refreshNotifications()
  if (navActive.value === 'machineInventory') {
    void refreshInventoryOptions()
  }
  startNotificationsPolling()
  startProductsPolling()
}
onMounted(() => {
  observeProductCards()
  setupMobilePickerMode()
})
onUnmounted(() => {
  stopNotificationsPolling()
  stopProductsPolling()
  disconnectProductCardsObserver()
  cleanupMobilePickerMode()
  clearProductCardReturnTimers()
  clearNotificationHighlightTimers()
  stopBulkAvailabilityProgress()
  clearProductApplicationPickerCloseTimer()
  clearPriceProductPickerCloseTimer()
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
watch(navActive, () => {
  if (navActive.value === 'machineInventory' && !inventoryLoaded.value) {
    void refreshInventoryOptions()
  }
  if (navActive.value === 'machineInventory' && feedbackPanelExpanded.value) {
    void refreshFeedbackCenter()
  }
})

function disconnectProductCardsObserver() {
  productCardsObserver?.disconnect()
  productCardsObserver = null
}

function setupMobilePickerMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  mobilePickerMediaQuery = window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)')
  updateMobilePickerMode()
  if (typeof mobilePickerMediaQuery.addEventListener === 'function') {
    mobilePickerMediaQuery.addEventListener('change', updateMobilePickerMode)
  } else {
    mobilePickerMediaQuery.addListener(updateMobilePickerMode)
  }
}

function cleanupMobilePickerMode() {
  if (!mobilePickerMediaQuery) return
  if (typeof mobilePickerMediaQuery.removeEventListener === 'function') {
    mobilePickerMediaQuery.removeEventListener('change', updateMobilePickerMode)
  } else {
    mobilePickerMediaQuery.removeListener(updateMobilePickerMode)
  }
  mobilePickerMediaQuery = null
}

function updateMobilePickerMode() {
  mobilePickerMode.value = Boolean(mobilePickerMediaQuery?.matches)
}

function blurActivePickerInputOnMobile() {
  if (!mobilePickerMode.value || typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) {
    activeElement.blur()
  }
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

function clearProductApplicationPickerCloseTimer() {
  if (productApplicationPickerCloseTimer) {
    clearTimeout(productApplicationPickerCloseTimer)
    productApplicationPickerCloseTimer = null
  }
}

function clearPriceProductPickerCloseTimer() {
  if (priceProductPickerCloseTimer) {
    clearTimeout(priceProductPickerCloseTimer)
    priceProductPickerCloseTimer = null
  }
}

function resetFeedbackPanelState(options: { clearDrafts?: boolean } = {}) {
  clearProductApplicationPickerCloseTimer()
  clearPriceProductPickerCloseTimer()
  productApplicationPickerOpen.value = false
  priceProductPickerOpen.value = false
  feedbackNotice.value = ''
  feedbackError.value = ''

  if (!options.clearDrafts) return

  feedbackPanelExpanded.value = false
  feedbackCenterMode.value = 'product_application'
  feedbackMode.value = 'price_suggestion'
  submissionRecordsExpanded.value = false
  feedbackRecords.value = []
  productApplicationRecords.value = []
  productApplicationOptions.value = []
  productApplicationSearchInput.value = ''
  productApplicationSearchQuery.value = ''
  existingProductApplicationForm.productId = ''
  existingProductApplicationForm.reason = ''
  newProductApplicationForm.product = ''
  newProductApplicationForm.modelNote = ''
  newProductApplicationForm.reason = ''
  issueFeedbackForm.issueType = 'page'
  issueFeedbackForm.description = ''
  priceFeedbackForm.product = ''
  priceFeedbackForm.ruleId = ''
  priceFeedbackForm.priceIssueType = 'price_unreasonable'
  priceFeedbackForm.pricePerDay = ''
  priceFeedbackForm.reason = ''
  feedbackLoading.value = false
  feedbackSubmitting.value = false
  productApplicationOptionsLoading.value = false
  productApplicationSubmitting.value = false
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
  startProductsPolling()
}

async function refreshMerchantSession() {
  if (previewMode) {
    saveMerchantSession(PREVIEW_MERCHANT_SESSION)
    return
  }
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
  if (previewMode) {
    products.value = PREVIEW_PRODUCTS.map((product) => ({
      ...product,
      keywords: [...product.keywords],
    }))
    return
  }

  const loadProducts = async () => {
    products.value = await api.listProducts()

    const session = merchantSession.value
    if (session && !session.merchantName && merchantNameFromProducts.value) {
      saveMerchantSession({
        ...session,
        merchantName: merchantNameFromProducts.value,
      })
    }
  }

  if (products.value.length === 0) {
    await run(loadProducts)
    return
  }

  try {
    await loadProducts()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return
    }
    error.value = err instanceof Error ? err.message : '商品状态刷新失败'
  }
}

async function refreshInventoryOptions() {
  inventoryLoading.value = true
  inventoryError.value = ''
  if (previewMode) {
    inventoryOptions.owned = PREVIEW_INVENTORY_OPTIONS.owned.map((option) => ({
      ...option,
      keywords: [...(option.keywords || [])],
    }))
    inventoryOptions.catalog = PREVIEW_INVENTORY_OPTIONS.catalog.map((option) => ({
      ...option,
      keywords: [...(option.keywords || [])],
    }))
    latestInventoryItems.value = PREVIEW_LATEST_INVENTORY.items.map((item) => ({ ...item }))
    inventoryLoaded.value = true
    syncInventoryRows()
    inventoryLoading.value = false
    return
  }

  try {
    const [options, latest] = await Promise.all([
      api.listInventoryOptions(),
      api.listLatestInventory(),
    ])
    inventoryOptions.owned = options.owned || []
    inventoryOptions.catalog = options.catalog || []
    latestInventoryItems.value = latest.items || []
    inventoryLoaded.value = true
    syncInventoryRows()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return
    }
    inventoryError.value = err instanceof Error ? err.message : '库存加载失败'
  } finally {
    inventoryLoading.value = false
  }
}

function syncInventoryRows() {
  const optionMap = new Map<string, MerchantInventoryOption>()
  for (const option of [...inventoryOptions.owned, ...inventoryOptions.catalog]) {
    optionMap.set(option.rule_id, option)
  }
  inventoryRows.value = inventoryRows.value.map((row) => {
    const option = optionMap.get(row.rule_id)
    if (!option) return row
    return {
      ...row,
      source_type: option.source_type,
      product: option.product,
      latestQuantity: inventoryOptionLatestQuantity(option),
      has_active_application: option.has_active_application,
    }
  })
}

function inventoryOptionKey(option: MerchantInventoryOption) {
  return `${option.source_type}:${option.rule_id}`
}

function inventoryOptionLatestQuantity(option: MerchantInventoryOption) {
  const latest = latestInventoryMap.value.get(option.rule_id)
  if (typeof latest?.quantity === 'number') return latest.quantity
  return typeof option.latest_quantity === 'number' ? option.latest_quantity : null
}

function inventoryOptionStatusText(option: MerchantInventoryOption) {
  return option.source_type === 'owned' && option.available === false ? '暂停' : ''
}

function inventoryOptionActionText(option: MerchantInventoryOption) {
  const product = option.product.trim() || '机器'
  return inventorySelectedRuleIds.value.has(option.rule_id) ? `编辑 ${product} 数量` : `选择 ${product}`
}

function shouldShowInventoryOptionStatus(option: MerchantInventoryOption) {
  return option.source_type === 'owned' && option.available === false
}

function findExactInventorySearchOption() {
  const keyword = inventorySearchDraftName.value.toLowerCase()
  if (!keyword) return null
  return filteredInventoryOptions.value.find((option) => option.product.trim().toLowerCase() === keyword) || null
}

function addInventoryOption(option: MerchantInventoryOption) {
  const existingRow = inventoryRows.value.find((row) => row.rule_id === option.rule_id)
  if (existingRow) {
    focusInventoryQuantityInput(existingRow.key)
    return
  }
  const rowKey = inventoryOptionKey(option)
  inventoryRows.value.push({
    key: rowKey,
    source_type: option.source_type,
    rule_id: option.rule_id,
    product: option.product,
    quantity: String(inventoryOptionLatestQuantity(option) ?? ''),
    latestQuantity: inventoryOptionLatestQuantity(option),
    has_active_application: option.has_active_application,
  })
  inventoryNotice.value = ''
  inventoryError.value = ''
  inventorySearch.value = ''
  focusInventoryQuantityInput(rowKey)
}

function handleInventorySearchEnter(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  event.preventDefault()
  const exactOption = findExactInventorySearchOption()
  if (exactOption) {
    addInventoryOption(exactOption)
    return
  }

  const [firstOption, secondOption] = filteredInventoryOptions.value
  if (firstOption && !secondOption) {
    addInventoryOption(firstOption)
    return
  }

  if (inventorySearchHasNoMatches.value) {
    openInventoryProductApplicationFromSearch()
  }
}

function handleInventorySearchEscape(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (!inventorySearch.value) {
    return
  }

  event.preventDefault()
  inventorySearch.value = ''
  focusInventorySearchInput()
}

function removeInventoryRow(key: string) {
  inventoryRows.value = inventoryRows.value.filter((row) => row.key !== key)
  if (inventoryRows.value.length === 0) {
    focusInventorySearchInput()
  }
}

function updateInventoryRowQuantity(rowKey: string, event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null
  if (!input) return

  const row = inventoryRows.value.find((item) => item.key === rowKey)
  if (row) {
    row.quantity = input.value
  }
}

function isInventoryRowQuantityInvalid(row: InventoryDraftRow) {
  return row.quantity.trim().length > 0 && !hasValidInventorySnapshotQuantities([row])
}

function handleInventoryQuantityEnter(rowKey: string) {
  const rowIndex = inventoryRows.value.findIndex((item) => item.key === rowKey)
  if (rowIndex === -1) return

  const currentRow = inventoryRows.value[rowIndex]
  if (!hasValidInventorySnapshotQuantities([currentRow])) return

  const nextRow = inventoryRows.value[rowIndex + 1]
  if (nextRow) {
    focusInventoryQuantityInput(nextRow.key)
    return
  }

  const incompleteRow = inventoryRows.value.find((item) => !hasValidInventorySnapshotQuantities([item]))
  if (incompleteRow) {
    focusInventoryQuantityInput(incompleteRow.key)
    return
  }

  if (inventoryCanSubmit.value && !inventorySubmitting.value) {
    void submitInventorySnapshot()
  }
}

function handleInventoryQuantityEscape(rowKey: string, event: KeyboardEvent) {
  event.preventDefault()
  removeInventoryRow(rowKey)
}

function focusInventoryQuantityInput(rowKey: string) {
  void nextTick(() => {
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-inventory-row-key]'))
      .find((element) => element.dataset.inventoryRowKey === rowKey)
    input?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    input?.focus()
    input?.select()
  })
}

function focusInventorySearchInput() {
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('input[data-inventory-search]')
    input?.focus()
    input?.select()
  })
}

async function submitInventorySnapshot() {
  if (inventorySubmitting.value) {
    return
  }

  inventoryNotice.value = ''
  inventoryError.value = ''
  if (inventoryRows.value.length === 0) {
    inventoryError.value = '请先选机器'
    return
  }

  const { items, error } = buildInventorySnapshotPayload(inventoryRows.value)
  if (error) {
    inventoryError.value = error
    return
  }

  if (previewMode) {
    const submittedAt = new Date().toISOString()
    latestInventoryItems.value = items.map((item) => {
      const row = inventoryRows.value.find((draft) => draft.rule_id === item.rule_id)
      return {
        merchant_id: PREVIEW_MERCHANT_SESSION.merchantId || 'preview-merchant',
        merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
        rule_id: item.rule_id,
        product: row?.product || item.rule_id,
        source_type: item.source_type,
        quantity: item.quantity,
        product_application_id: item.source_type === 'catalog' ? 'preview-application' : null,
        submitted_at: submittedAt,
      }
    })
    for (const option of [...inventoryOptions.owned, ...inventoryOptions.catalog]) {
      const submitted = items.find((item) => item.rule_id === option.rule_id)
      if (submitted) {
        option.latest_quantity = submitted.quantity
      }
    }
    inventoryNotice.value = `预览已提交 ${items.length} 台机器库存`
    inventoryRows.value = []
    focusInventorySearchInput()
    return
  }

  inventorySubmitting.value = true
  try {
    const result = await api.submitInventorySnapshot(items)
    inventoryNotice.value = `已提交 ${result.items.length || items.length} 台机器库存`
    inventoryRows.value = []
    await refreshInventoryOptions()
    focusInventorySearchInput()
  } catch (err) {
    inventoryError.value = err instanceof Error ? err.message : '库存提交失败'
  } finally {
    inventorySubmitting.value = false
  }
}

async function refreshNotifications() {
  if (previewMode) {
    notifications.value = PREVIEW_NOTIFICATIONS_RESPONSE.items.map((item) => ({ ...item }))
    dispatchTrend.value = PREVIEW_NOTIFICATIONS_RESPONSE.chart.map((item) => ({ ...item }))
    notificationsSummary.today_count = PREVIEW_NOTIFICATIONS_RESPONSE.today_count
    notificationsSummary.unread_count = PREVIEW_NOTIFICATIONS_RESPONSE.unread_count
    knownNotificationIds.value = new Set(notifications.value.map((item) => item.id))
    notificationsLoaded.value = true
    return
  }

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

function startProductsPolling() {
  stopProductsPolling()
  productsTimer = setInterval(refreshProducts, 30000)
}

function stopNotificationsPolling() {
  if (notificationsTimer) {
    clearInterval(notificationsTimer)
    notificationsTimer = null
  }
}

function stopProductsPolling() {
  if (productsTimer) {
    clearInterval(productsTimer)
    productsTimer = null
  }
}

function goToNotifications() {
  markDashboardNotificationsRead()
  navActive.value = 'notifications'
  newDispatchBurstCount.value = 0
}

function openInventoryFeedback(mode: FeedbackCenterMode = 'product_application') {
  feedbackCenterMode.value = mode
  feedbackPanelExpanded.value = true
  feedbackNotice.value = ''
  feedbackError.value = ''
  navActive.value = 'machineInventory'
  scrollInventoryFeedbackIntoView()
  void refreshFeedbackCenter()
}

function scrollInventoryFeedbackIntoView() {
  void nextTick(() => {
    const panel = document.querySelector<HTMLElement>('.inventory-feedback-section')
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function closeInventoryFeedback() {
  feedbackPanelExpanded.value = false
  resetFeedbackPanelState()
}

function goToFeedback(mode: FeedbackCenterMode = 'product_application') {
  openInventoryFeedback(mode)
}

function goToPriceFeedback(product: MerchantProduct) {
  feedbackCenterMode.value = 'feedback'
  feedbackPanelExpanded.value = true
  feedbackMode.value = 'price_suggestion'
  priceFeedbackForm.product = product.product
  priceFeedbackForm.ruleId = product.rule_id
  priceFeedbackForm.priceIssueType = 'price_unreasonable'
  priceFeedbackForm.pricePerDay = ''
  priceFeedbackForm.reason = ''
  feedbackNotice.value = ''
  feedbackError.value = ''
  navActive.value = 'machineInventory'
  scrollInventoryFeedbackIntoView()
  void refreshFeedbackCenter()
}

function switchFeedbackCenterMode(mode: FeedbackCenterMode) {
  feedbackCenterMode.value = mode
  feedbackNotice.value = ''
  feedbackError.value = ''
  if (mode === 'product_application') {
    void refreshProductApplicationOptions()
  }
}

function syncSelectedProductApplicationOption() {
  if (!existingProductApplicationForm.productId) return
  const selectedExists = productApplicationOptions.value.some(
    (option) => option.product_id === existingProductApplicationForm.productId
  )
  if (!selectedExists) {
    existingProductApplicationForm.productId = ''
  }
}

function applyProductApplicationSearch() {
  productApplicationSearchQuery.value = productApplicationSearchInput.value.trim()
  openProductApplicationPicker()
}

function openProductApplicationPicker(options: { blurActiveInput?: boolean } = {}) {
  clearProductApplicationPickerCloseTimer()
  productApplicationPickerOpen.value = true
  if (options.blurActiveInput !== false) {
    void nextTick(blurActivePickerInputOnMobile)
  }
}

function closeProductApplicationPicker() {
  clearProductApplicationPickerCloseTimer()
  productApplicationPickerOpen.value = false
}

function closeProductApplicationPickerSoon() {
  if (mobilePickerMode.value) return
  clearProductApplicationPickerCloseTimer()
  productApplicationPickerCloseTimer = setTimeout(() => {
    productApplicationPickerOpen.value = false
    productApplicationPickerCloseTimer = null
  }, 120)
}

function handleProductApplicationSearchInput() {
  productApplicationSearchQuery.value = productApplicationSearchInput.value.trim()
  openProductApplicationPicker({ blurActiveInput: false })
}

function selectProductApplicationOption(productId: string) {
  existingProductApplicationForm.productId = productId
  newProductApplicationForm.product = ''
  newProductApplicationForm.modelNote = ''
  newProductApplicationForm.reason = ''
  productApplicationSearchInput.value = ''
  productApplicationSearchQuery.value = ''
  productApplicationPickerOpen.value = false
}

function chooseNewProductApplicationFromSearch() {
  const product = productApplicationDraftName.value
  if (!product) {
    feedbackError.value = '请先输入想申请的商品名称'
    return
  }
  existingProductApplicationForm.productId = ''
  newProductApplicationForm.product = product
  productApplicationSearchInput.value = product
  productApplicationSearchQuery.value = product
  productApplicationPickerOpen.value = false
  feedbackNotice.value = ''
  feedbackError.value = ''
}

function openInventoryProductApplicationFromSearch() {
  const product = inventorySearchDraftName.value
  if (!product) return

  productApplicationSearchInput.value = product
  productApplicationSearchQuery.value = product
  openInventoryFeedback('product_application')
  chooseNewProductApplicationFromSearch()
}

function toggleSubmissionRecords() {
  submissionRecordsExpanded.value = !submissionRecordsExpanded.value
}

function syncPriceFeedbackRuleId() {
  const selected = products.value.find((product) => product.product === priceFeedbackForm.product)
  priceFeedbackForm.ruleId = selected?.rule_id || ''
}

function openPriceProductPicker(options: { blurActiveInput?: boolean } = {}) {
  clearPriceProductPickerCloseTimer()
  priceProductPickerOpen.value = true
  if (options.blurActiveInput !== false) {
    void nextTick(blurActivePickerInputOnMobile)
  }
}

function openPriceProductPickerFromFocus() {
  if (mobilePickerMode.value) return
  openPriceProductPicker()
}

function closePriceProductPicker() {
  clearPriceProductPickerCloseTimer()
  priceProductPickerOpen.value = false
}

function closePriceProductPickerSoon() {
  if (mobilePickerMode.value) return
  clearPriceProductPickerCloseTimer()
  priceProductPickerCloseTimer = setTimeout(() => {
    priceProductPickerOpen.value = false
    priceProductPickerCloseTimer = null
  }, 120)
}

function handlePriceProductInput() {
  syncPriceFeedbackRuleId()
  openPriceProductPicker({ blurActiveInput: false })
}

function selectFeedbackProduct(product: MerchantProduct) {
  priceFeedbackForm.product = product.product
  priceFeedbackForm.ruleId = product.rule_id
  closePriceProductPicker()
}

function selectPriceIssueFeedback(value: MerchantPriceIssueType) {
  priceFeedbackForm.priceIssueType = value
  if (value !== 'price_unreasonable') {
    priceFeedbackForm.pricePerDay = ''
  }
}

function sortFeedbackRecords(items: MerchantFeedbackRecord[]) {
  return [...items].sort((left, right) => feedbackRecordTime(right) - feedbackRecordTime(left))
}

function sortProductApplicationRecords(items: MerchantProductApplicationRecord[]) {
  return [...items].sort((left, right) => recordTime(right.created_at) - recordTime(left.created_at))
}

function feedbackRecordTime(record: MerchantFeedbackRecord) {
  return recordTime(record.created_at || '')
}

function recordTime(value: string) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function prependFeedbackRecord(record: MerchantFeedbackRecord) {
  feedbackRecords.value = sortFeedbackRecords([
    record,
    ...feedbackRecords.value.filter((item) => item.id !== record.id),
  ])
}

function prependProductApplicationRecord(record: MerchantProductApplicationRecord) {
  productApplicationRecords.value = sortProductApplicationRecords([
    record,
    ...productApplicationRecords.value.filter((item) => item.id !== record.id),
  ])
}

async function refreshFeedbackCenter() {
  if (previewMode) {
    feedbackLoading.value = false
    productApplicationOptionsLoading.value = false
    if (feedbackCenterMode.value === 'product_application') {
      await refreshProductApplicationOptions()
    }
    return
  }

  const tasks = [refreshSubmissionRecords()]
  if (feedbackCenterMode.value === 'product_application') {
    tasks.push(refreshProductApplicationOptions())
  }
  await Promise.all(tasks)
}

async function refreshFeedbackRecords() {
  await refreshSubmissionRecords()
}

async function refreshSubmissionRecords() {
  if (previewMode) {
    feedbackError.value = ''
    feedbackRecords.value = sortFeedbackRecords(feedbackRecords.value)
    productApplicationRecords.value = sortProductApplicationRecords(productApplicationRecords.value)
    feedbackLoading.value = false
    return
  }

  if (!isLoggedIn.value) return
  feedbackLoading.value = true
  feedbackError.value = ''
  try {
    const result = await api.listFeedback()
    feedbackRecords.value = sortFeedbackRecords(result.items || [])
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return
    if (err instanceof ApiError && err.status === 404) {
      feedbackRecords.value = []
    } else {
      feedbackError.value = feedbackErrorMessage(err, '反馈记录加载失败')
    }
  }
  try {
    const result = await api.listProductApplications()
    productApplicationRecords.value = sortProductApplicationRecords(result.items || [])
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return
    if (err instanceof ApiError && err.status === 404) {
      productApplicationRecords.value = []
    } else {
      feedbackError.value = feedbackErrorMessage(err, '提交记录加载失败')
    }
  } finally {
    feedbackLoading.value = false
  }
}

async function refreshProductApplicationOptions() {
  if (previewMode) {
    productApplicationOptions.value = PREVIEW_INVENTORY_OPTIONS.catalog.map((option) => ({
      product_id: `preview-product-${option.rule_id}`,
      rule_id: option.rule_id,
      product: option.product,
      keywords: [...(option.keywords || [])],
      category: option.category || null,
    }))
    syncSelectedProductApplicationOption()
    productApplicationOptionsLoading.value = false
    return
  }

  if (!isLoggedIn.value) return
  productApplicationOptionsLoading.value = true
  try {
    const result = await api.listProductApplicationOptions()
    productApplicationOptions.value = result.items || []
    syncSelectedProductApplicationOption()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return
    if (err instanceof ApiError && err.status === 404) {
      productApplicationOptions.value = []
    } else {
      feedbackError.value = feedbackErrorMessage(err, '可申请商品加载失败')
    }
  } finally {
    productApplicationOptionsLoading.value = false
  }
}

function feedbackErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (message === 'Not Found') {
      return '\u53cd\u9988\u670d\u52a1\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'
    }
    return message || fallback
  }
  return fallback
}

async function submitProductApplication() {
  if (productApplicationIsNew.value) {
    await submitNewProductApplication()
    return
  }
  await submitExistingProductApplication()
}

async function submitExistingProductApplication() {
  const option = selectedProductApplicationOption.value
  const reason = existingProductApplicationForm.reason.trim()
  if (!option) {
    feedbackError.value = '请先选择商品，或搜索后申请新增商品'
    return
  }
  if (!reason) {
    feedbackError.value = '请填写申请说明'
    return
  }
  const payload = {
    application_type: 'existing_product' as const,
    product_id: option.product_id,
    rule_id: option.rule_id || option.product_id,
    product: option.product,
    reason,
    contact: accountLabel.value,
  }
  feedbackNotice.value = ''
  feedbackError.value = ''
  if (previewMode) {
    const record = createPreviewProductApplicationRecord({
      application_type: 'existing_product',
      product_id: option.product_id,
      rule_id: option.rule_id || option.product_id,
      product: option.product,
      reason,
      contact: accountLabel.value,
    })
    prependProductApplicationRecord(record)
    existingProductApplicationForm.productId = ''
    existingProductApplicationForm.reason = ''
    productApplicationSearchInput.value = ''
    productApplicationSearchQuery.value = ''
    feedbackNotice.value = '预览已记录商品申请'
    return
  }
  productApplicationSubmitting.value = true
  try {
    const record = await api.submitProductApplication(payload)
    prependProductApplicationRecord(record)
    existingProductApplicationForm.productId = ''
    existingProductApplicationForm.reason = ''
    productApplicationSearchInput.value = ''
    productApplicationSearchQuery.value = ''
    feedbackNotice.value = '商品申请已提交，平台审批通过后会为你开通'
  } catch (err) {
    feedbackError.value = feedbackErrorMessage(err, '商品申请提交失败')
  } finally {
    productApplicationSubmitting.value = false
  }
}

async function submitNewProductApplication() {
  const product = newProductApplicationForm.product.trim()
  const reason = newProductApplicationForm.reason.trim()
  if (!product) {
    feedbackError.value = '请填写商品名称'
    return
  }
  if (!reason) {
    feedbackError.value = '请填写申请说明'
    return
  }
  const payload = {
    application_type: 'new_product' as const,
    product,
    model_note: newProductApplicationForm.modelNote.trim() || null,
    reason,
    contact: accountLabel.value,
  }
  feedbackNotice.value = ''
  feedbackError.value = ''
  if (previewMode) {
    const record = createPreviewProductApplicationRecord({
      application_type: 'new_product',
      product,
      model_note: newProductApplicationForm.modelNote.trim() || null,
      reason,
      contact: accountLabel.value,
    })
    prependProductApplicationRecord(record)
    newProductApplicationForm.product = ''
    newProductApplicationForm.modelNote = ''
    newProductApplicationForm.reason = ''
    productApplicationSearchInput.value = ''
    productApplicationSearchQuery.value = ''
    feedbackNotice.value = '预览已记录新增商品申请'
    return
  }
  productApplicationSubmitting.value = true
  try {
    const record = await api.submitProductApplication(payload)
    prependProductApplicationRecord(record)
    newProductApplicationForm.product = ''
    newProductApplicationForm.modelNote = ''
    newProductApplicationForm.reason = ''
    productApplicationSearchInput.value = ''
    productApplicationSearchQuery.value = ''
    feedbackNotice.value = '新增商品申请已提交，平台将尽快处理'
  } catch (err) {
    feedbackError.value = feedbackErrorMessage(err, '新增商品申请提交失败')
  } finally {
    productApplicationSubmitting.value = false
  }
}

async function submitIssueFeedback() {
  const description = issueFeedbackForm.description.trim()
  if (!description) {
    feedbackError.value = '请先填写问题描述'
    return
  }
  const payload = {
    type: 'issue' as const,
    issue_type: issueFeedbackForm.issueType,
    description,
    contact: accountLabel.value,
  }
  feedbackNotice.value = ''
  feedbackError.value = ''
  if (previewMode) {
    const record = createPreviewFeedbackRecord({
      type: 'issue',
      issue_type: issueFeedbackForm.issueType,
      description,
      contact: accountLabel.value,
    })
    prependFeedbackRecord(record)
    issueFeedbackForm.description = ''
    feedbackNotice.value = '预览已记录问题反馈'
    return
  }
  feedbackSubmitting.value = true
  try {
    const record = await api.submitFeedback(payload)
    prependFeedbackRecord(record)
    issueFeedbackForm.description = ''
    feedbackNotice.value = '问题反馈已提交'
  } catch (err) {
    feedbackError.value = feedbackErrorMessage(err, '反馈提交失败')
  } finally {
    feedbackSubmitting.value = false
  }
}

async function submitPriceFeedback() {
  const product = priceFeedbackForm.product.trim()
  syncPriceFeedbackRuleId()
  const pricePerDay = Number(priceFeedbackForm.pricePerDay)
  const reason = priceFeedbackForm.reason.trim()
  if (!product) {
    feedbackError.value = '请先选择商品'
    return
  }
  if (priceFeedbackRequiresPrice.value && (!Number.isInteger(pricePerDay) || pricePerDay <= 0)) {
    feedbackError.value = '请填写有效的整数建议价格'
    return
  }
  if (!priceFeedbackRequiresPrice.value && !reason) {
    feedbackError.value = '请填写原因说明'
    return
  }
  const payload = {
    type: 'price_suggestion' as const,
    product,
    rule_id: priceFeedbackForm.ruleId || null,
    price_issue_type: priceFeedbackForm.priceIssueType,
    price_per_day: priceFeedbackRequiresPrice.value ? pricePerDay : null,
    reason: reason || null,
    contact: accountLabel.value,
  }
  feedbackNotice.value = ''
  feedbackError.value = ''
  if (previewMode) {
    const record = createPreviewFeedbackRecord({
      type: 'price_suggestion',
      product,
      rule_id: priceFeedbackForm.ruleId || null,
      price_issue_type: priceFeedbackForm.priceIssueType,
      price_per_day: priceFeedbackRequiresPrice.value ? pricePerDay : null,
      reason: reason || null,
      contact: accountLabel.value,
    })
    prependFeedbackRecord(record)
    priceFeedbackForm.pricePerDay = ''
    priceFeedbackForm.reason = ''
    feedbackNotice.value = '预览已记录价格反馈'
    return
  }
  feedbackSubmitting.value = true
  try {
    const record = await api.submitFeedback(payload)
    prependFeedbackRecord(record)
    priceFeedbackForm.pricePerDay = ''
    priceFeedbackForm.reason = ''
    feedbackNotice.value = '价格建议已提交'
  } catch (err) {
    feedbackError.value = feedbackErrorMessage(err, '反馈提交失败')
  } finally {
    feedbackSubmitting.value = false
  }
}

function feedbackStatusText(status: string) {
  return ({
    submitted: '已提交',
    processing: '处理中',
    resolved: '已处理',
  } as Record<string, string>)[status] || '已提交'
}

function productApplicationStatusText(status: string) {
  return ({
    submitted: '已提交',
    reviewing: '审核中',
    manual_processing: '待人工添加',
    enabled: '已开通',
    rejected: '已驳回',
  } as Record<string, string>)[status] || '已提交'
}

function feedbackTypeText(type: string) {
  return type === 'price_suggestion' ? '机器价格推荐反馈' : '问题反馈'
}

function productApplicationTypeText(type: string) {
  return type === 'new_product' ? '新增商品' : '商品申请'
}

function feedbackSummary(record: MerchantFeedbackRecord) {
  if (record.type === 'price_suggestion') {
    const price = record.price_per_day ? ` · ${record.price_per_day} 元/天` : ''
    return `${record.product || '未选择商品'}${price}`
  }
  return record.description || record.reason || '暂无描述'
}

function feedbackRecordDetail(record: MerchantFeedbackRecord) {
  if (record.type === 'price_suggestion') {
    return record.reason || '推荐价格、型号或其他价格相关反馈'
  }
  return record.description || '问题反馈已提交'
}

function productApplicationSummary(record: MerchantProductApplicationRecord) {
  if (record.application_type === 'new_product') {
    const modelNote = record.model_note ? ` · ${record.model_note}` : ''
    return `${record.reason || '平台将尽快处理该商品添加申请'}${modelNote}`
  }
  return record.reason || '审批通过后将为你开通该商品接单'
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
    expandingProduct.value = ruleId
    const p = products.value.find((pp) => pp.rule_id === ruleId)
    const resumeDate = p?.resume_at ? new Date(p.resume_at) : null
    if (resumeDate && !Number.isNaN(resumeDate.getTime())) {
      pauseForm.resumeMode = 'scheduled'
      pauseForm.resumeAt = toDatetimeLocalValue(resumeDate)
    } else {
      pauseForm.resumeMode = p?.available === false ? 'manual' : 'scheduled'
      pauseForm.resumeAt = nextResumeTimeInput()
    }
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
  bulkAvailabilityDialog.resumeMode = 'scheduled'
  bulkAvailabilityDialog.resumeAt = mode === 'pause' ? nextResumeTimeInput() : ''
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
  const available = mode === 'resume'
  const pauseResumeAt = mode === 'pause' && bulkAvailabilityDialog.resumeMode === 'scheduled'
    ? datetimeLocalToIso(bulkAvailabilityDialog.resumeAt)
    : null
  if (
    mode === 'pause' &&
    bulkAvailabilityDialog.resumeMode === 'scheduled' &&
    (!pauseResumeAt || !isFutureDatetimeLocal(bulkAvailabilityDialog.resumeAt))
  ) {
    error.value = '请选择未来的恢复接单时间'
    return
  }

  startBulkAvailabilityProgress(ruleIds.length)
  try {
    if (previewMode) {
      const ruleIdSet = new Set(ruleIds)
      const updatedAt = new Date().toISOString()
      products.value = products.value.map((product) => (
        ruleIdSet.has(product.rule_id)
          ? {
            ...product,
            available,
            resume_at: available ? null : pauseResumeAt,
            updated_at: updatedAt,
          }
          : product
      ))
      bulkAvailabilityProgress.current = ruleIds.length
      bulkAvailabilityDialog.open = false
      expandingProduct.value = null
      return
    }

    const result = await api.bulkUpdateAvailability(ruleIds, available, { resumeAt: pauseResumeAt })
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
  if (previewMode) {
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) {
      products.value[idx] = {
        ...products.value[idx],
        available: true,
        resume_at: null,
        updated_at: new Date().toISOString(),
      }
    }
    expandingProduct.value = null
    return
  }

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
  const pauseResumeAt = pauseForm.resumeMode === 'scheduled' ? datetimeLocalToIso(pauseForm.resumeAt) : null
  if (pauseForm.resumeMode === 'scheduled' && (!pauseResumeAt || !isFutureDatetimeLocal(pauseForm.resumeAt))) {
    error.value = '请选择未来的恢复接单时间'
    return
  }

  error.value = ''
  if (previewMode) {
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) {
      products.value[idx] = {
        ...products.value[idx],
        available: false,
        resume_at: pauseResumeAt,
        updated_at: new Date().toISOString(),
      }
    }
    expandingProduct.value = null
    return
  }

  submittingProduct.value = ruleId
  try {
    const updated = await api.updateAvailability(ruleId, false, { resumeAt: pauseResumeAt })
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
  bulkAvailabilityDialog.resumeMode = 'scheduled'
  bulkAvailabilityDialog.resumeAt = ''
  bulkAvailabilityProgress.processing = false
  bulkAvailabilityProgress.current = 0
  bulkAvailabilityProgress.total = 0
  stopBulkAvailabilityProgress()
  saveMerchantSession(null)
  api.setToken(''); products.value = []
  notifications.value = []
  dispatchTrend.value = []
  inventoryOptions.owned = []
  inventoryOptions.catalog = []
  latestInventoryItems.value = []
  inventoryRows.value = []
  inventorySearch.value = ''
  inventoryLoaded.value = false
  inventoryNotice.value = ''
  inventoryError.value = ''
  resetFeedbackPanelState({ clearDrafts: true })
  notificationsSummary.today_count = 0
  notificationsSummary.unread_count = 0
  knownNotificationIds.value = new Set()
  localReadNotificationIds.value = new Set()
  clearNotificationHighlightTimers()
  notificationsLoaded.value = false
  newDispatchBurstCount.value = 0
  stopNotificationsPolling()
  stopProductsPolling()
  expandingProduct.value = null; pauseForm.resumeAt = ''; pauseForm.resumeMode = 'scheduled'
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

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function nextResumeTimeInput() {
  const next = new Date(Date.now() + 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  return toDatetimeLocalValue(next)
}

function datetimeLocalToIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function isFutureDatetimeLocal(value: string) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
}

function formatResumeAt(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未设置'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function pausedResumeLabel(value?: string | null) {
  if (!value) return '恢复方式：手动恢复'
  return `恢复接单时间：${formatResumeAt(value)}`
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
        <button :class="{ active: navActive === 'machineInventory' }" @click="navActive = 'machineInventory'">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/><circle cx="8" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="17" r="1"/></svg>
          机器库存
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
                      <label>恢复方式</label>
                      <div class="pause-resume-mode" role="radiogroup" aria-label="恢复方式">
                        <button
                          type="button"
                          class="pause-resume-mode-btn"
                          :class="{ active: pauseForm.resumeMode === 'scheduled' }"
                          @click="pauseForm.resumeMode = 'scheduled'"
                        >
                          定时自动恢复
                        </button>
                        <button
                          type="button"
                          class="pause-resume-mode-btn"
                          :class="{ active: pauseForm.resumeMode === 'manual' }"
                          @click="pauseForm.resumeMode = 'manual'"
                        >
                          手动恢复
                        </button>
                      </div>
                      <template v-if="pauseForm.resumeMode === 'scheduled'">
                        <label>恢复接单时间</label>
                        <input
                          v-model="pauseForm.resumeAt"
                          class="pause-time-input"
                          type="datetime-local"
                          :min="toDatetimeLocalValue(new Date())"
                        />
                        <p class="pause-form-hint">到达该时间后，系统会自动恢复此商品接单。</p>
                      </template>
                      <p v-else class="pause-form-hint">暂停后不会自动恢复，商户需要在已暂停区域手动点击恢复接单。</p>
                      <div class="pause-form-actions">
                        <button class="btn btn-ghost pause-price-feedback-btn" @click="goToPriceFeedback(p)">价格反馈</button>
                        <span class="pause-form-action-spacer"></span>
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
                    <div class="product-card-meta">{{ pausedResumeLabel(p.resume_at) }} · 状态更新：{{ relativeTime(p.updated_at) }}</div>
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

        <!-- Machine Inventory -->
        <template v-if="navActive === 'machineInventory'">
          <div class="inventory-page">
            <h1 class="sr-only">机器库存</h1>

            <p v-if="inventoryNotice" class="inventory-notice">{{ inventoryNotice }}</p>
            <p v-if="inventoryError" class="inventory-error">{{ inventoryError }}</p>

            <div class="inventory-layout">
              <section class="inventory-picker-card">
                <div class="inventory-picker-toolbar">
                  <input
                    v-model="inventorySearch"
                    type="search"
                    enterkeyhint="next"
                    autocomplete="off"
                    aria-label="搜索机器"
                    data-inventory-search
                    @keydown.enter="handleInventorySearchEnter"
                    @keydown.esc="handleInventorySearchEscape"
                    placeholder="搜索机器"
                  />
                </div>

                <div v-if="inventoryLoading" class="notif-empty">加载中...</div>
                <div v-else class="inventory-option-list">
                  <div
                    v-for="item in filteredInventoryOptionRows"
                    :key="inventoryOptionKey(item.option)"
                    class="inventory-option-row"
                    :class="{ selected: Boolean(item.row), invalid: item.row ? isInventoryRowQuantityInvalid(item.row) : false }"
                  >
                    <button
                      type="button"
                      class="inventory-option-main inventory-option-select"
                      :aria-label="inventoryOptionActionText(item.option)"
                      :title="inventoryOptionActionText(item.option)"
                      @click="addInventoryOption(item.option)"
                    >
                      <strong>{{ item.option.product }}</strong>
                    </button>
                    <span v-if="shouldShowInventoryOptionStatus(item.option)" class="inventory-option-tags">
                      <em class="inventory-chip muted">{{ inventoryOptionStatusText(item.option) }}</em>
                    </span>
                    <template v-if="item.row">
                      <label class="inventory-quantity-field inventory-inline-quantity">
                      <input
                        :value="item.row.quantity"
                        :data-inventory-row-key="item.row.key"
                        :aria-label="`${item.row.product} 库存数量`"
                        type="number"
                        inputmode="numeric"
                        enterkeyhint="done"
                        autocomplete="off"
                        min="0"
                        step="1"
                        :aria-invalid="isInventoryRowQuantityInvalid(item.row) ? 'true' : 'false'"
                        @input="updateInventoryRowQuantity(item.row.key, $event)"
                        @keydown.enter.prevent="handleInventoryQuantityEnter(item.row.key)"
                        @keydown.esc="handleInventoryQuantityEscape(item.row.key, $event)"
                      />
                      </label>
                      <button
                        type="button"
                        class="btn btn-ghost inventory-remove-row"
                        aria-label="移除"
                        @click="removeInventoryRow(item.row.key)"
                      >
                        &times;
                      </button>
                    </template>
                  </div>
                  <div v-if="inventoryShouldShowEmptyState" class="inventory-empty">
                    <span>{{ inventorySearchHasNoMatches ? '没有找到机器' : '暂无机器' }}</span>
                    <button
                      v-if="inventorySearchHasNoMatches"
                      type="button"
                      class="inventory-empty-apply"
                      @click="openInventoryProductApplicationFromSearch"
                    >
                      申请新增
                    </button>
                  </div>
                </div>

                <div v-if="inventoryRows.length > 0" class="inventory-submit-footer">
                  <button class="btn btn-primary" :disabled="inventorySubmitDisabled" @click="submitInventorySnapshot">
                    {{ inventorySubmitting ? '提交中' : '提交' }}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </template>

        <div v-if="bulkAvailabilityDialog.open" class="bulk-dialog-backdrop">
          <div class="bulk-dialog-card">
            <h2>{{ bulkAvailabilityDialog.mode === 'pause' ? '确认暂停全部接单？' : '确认恢复全部接单？' }}</h2>
            <p>{{ bulkAvailabilityDialogDescription }}</p>
            <div v-if="bulkAvailabilityDialog.mode === 'pause'" class="field">
              <label>恢复方式</label>
              <div class="pause-resume-mode" role="radiogroup" aria-label="恢复方式">
                <button
                  type="button"
                  class="pause-resume-mode-btn"
                  :class="{ active: bulkAvailabilityDialog.resumeMode === 'scheduled' }"
                  :disabled="bulkAvailabilityProgress.processing"
                  @click="bulkAvailabilityDialog.resumeMode = 'scheduled'"
                >
                  定时自动恢复
                </button>
                <button
                  type="button"
                  class="pause-resume-mode-btn"
                  :class="{ active: bulkAvailabilityDialog.resumeMode === 'manual' }"
                  :disabled="bulkAvailabilityProgress.processing"
                  @click="bulkAvailabilityDialog.resumeMode = 'manual'"
                >
                  手动恢复
                </button>
              </div>
              <template v-if="bulkAvailabilityDialog.resumeMode === 'scheduled'">
                <label>恢复接单时间</label>
                <input
                  v-model="bulkAvailabilityDialog.resumeAt"
                  type="datetime-local"
                  :min="toDatetimeLocalValue(new Date())"
                  :disabled="bulkAvailabilityProgress.processing"
                />
                <p class="pause-form-hint">到达该时间后，系统会自动恢复这些商品接单。</p>
              </template>
              <p v-else class="pause-form-hint">暂停后不会自动恢复，商户需要在已暂停区域手动点击恢复接单。</p>
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

        <!-- Embedded Feedback -->
        <section
          v-if="navActive === 'machineInventory' && feedbackPanelExpanded"
          class="inventory-feedback-section"
        >
          <div class="inventory-feedback-strip">
            <div class="inventory-feedback-actions">
              <button
                type="button"
                class="btn btn-ghost inventory-feedback-close"
                aria-label="收起申请/反馈"
                title="收起申请/反馈"
                @click="closeInventoryFeedback"
              >
                &times;
              </button>
            </div>
          </div>

          <div class="feedback-tabs" role="tablist" aria-label="申请与反馈类型">
            <span
              class="feedback-tab-indicator"
              :style="{ '--feedback-active-index': feedbackCenterMode === 'feedback' ? 1 : 0 }"
              aria-hidden="true"
            ></span>
            <button
              :class="['feedback-tab', { active: feedbackCenterMode === 'product_application' }]"
              @click="switchFeedbackCenterMode('product_application')"
            >
              商品申请
            </button>
            <button
              :class="['feedback-tab', { active: feedbackCenterMode === 'feedback' }]"
              @click="switchFeedbackCenterMode('feedback')"
            >
              问题 / 价格反馈
            </button>
          </div>

            <p v-if="feedbackNotice" class="feedback-notice">{{ feedbackNotice }}</p>
            <p v-if="feedbackError" class="feedback-error">{{ feedbackError }}</p>

          <div class="feedback-form-card product-application-card" v-if="feedbackCenterMode === 'product_application'">
            <div class="field">
              <label>申请商品</label>
              <div class="product-application-picker">
                <div v-if="productApplicationOptionsLoading" class="notif-empty">可申请商品加载中...</div>
                <div class="product-application-combobox" :class="{ open: productApplicationPickerOpen }">
                  <div class="product-application-search">
                    <input
                      v-model="productApplicationSearchInput"
                      placeholder="搜索商品，或输入想申请的新商品"
                      autocomplete="off"
                      role="combobox"
                      aria-controls="product-application-listbox"
                      :aria-expanded="productApplicationPickerOpen"
                      :readonly="mobilePickerMode"
                      @pointerdown="openProductApplicationPicker()"
                      @mousedown.prevent="openProductApplicationPicker()"
                      @focus="openProductApplicationPicker()"
                      @click="openProductApplicationPicker()"
                      @blur="closeProductApplicationPickerSoon"
                      @input="handleProductApplicationSearchInput"
                      @keyup.enter="applyProductApplicationSearch"
                    />
                  </div>
                  <div
                    v-if="productApplicationPickerOpen"
                    id="product-application-listbox"
                    class="product-application-panel"
                    role="listbox"
                  >
                    <button
                      v-for="option in filteredProductApplicationOptions"
                      :key="option.product_id"
                      type="button"
                      role="option"
                      :aria-selected="existingProductApplicationForm.productId === option.product_id"
                      :class="['product-application-option', { active: existingProductApplicationForm.productId === option.product_id }]"
                      @click="selectProductApplicationOption(option.product_id)"
                    >
                      <strong>{{ option.product }}</strong>
                    </button>
                    <div v-if="filteredProductApplicationOptions.length === 0" class="product-application-empty">
                      <strong>没有找到「{{ productApplicationDraftName || '该商品' }}」</strong>
                      <button
                        v-if="productApplicationDraftName"
                        type="button"
                        class="product-application-create"
                        @click="chooseNewProductApplicationFromSearch"
                      >
                        申请新增商品「{{ productApplicationDraftName }}」
                      </button>
                      <span v-else>输入名称后申请新增</span>
                    </div>
                  </div>
                  <div
                    v-if="productApplicationPickerOpen"
                    class="product-application-mobile-backdrop"
                    @click="closeProductApplicationPicker"
                  ></div>
                  <div v-if="productApplicationPickerOpen" class="product-application-mobile-sheet" role="dialog" aria-label="选择可申请商品">
                    <div class="product-application-mobile-header">
                      <strong>选择或新增商品</strong>
                      <button type="button" aria-label="关闭" @click="closeProductApplicationPicker">&times;</button>
                    </div>
                    <div class="product-application-mobile-search">
                      <input
                        v-model="productApplicationSearchInput"
                        placeholder="搜索商品，或输入想申请的新商品"
                        autocomplete="off"
                        @input="handleProductApplicationSearchInput"
                        @keyup.enter="applyProductApplicationSearch"
                      />
                    </div>
                    <div class="product-application-mobile-list">
                      <button
                        v-for="option in filteredProductApplicationOptions"
                        :key="`mobile-${option.product_id}`"
                        type="button"
                        :class="['product-application-option', { active: existingProductApplicationForm.productId === option.product_id }]"
                        @click="selectProductApplicationOption(option.product_id)"
                      >
                        <strong>{{ option.product }}</strong>
                      </button>
                      <div v-if="filteredProductApplicationOptions.length === 0" class="product-application-empty">
                        <strong>没有找到「{{ productApplicationDraftName || '该商品' }}」</strong>
                        <button
                          v-if="productApplicationDraftName"
                          type="button"
                          class="product-application-create"
                          @click="chooseNewProductApplicationFromSearch"
                        >
                          申请新增商品「{{ productApplicationDraftName }}」
                        </button>
                        <span v-else>输入名称后申请新增</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-if="productApplicationSelectedName"
                  class="product-application-selected"
                  role="button"
                  tabindex="0"
                  @click="openProductApplicationPicker()"
                  @keydown.enter.prevent="openProductApplicationPicker()"
                  @keydown.space.prevent="openProductApplicationPicker()"
                >
                  <span>
                    <small>{{ productApplicationIsNew ? '已选择新增商品' : '已选择商品' }}</small>
                    <strong>{{ productApplicationSelectedName }}</strong>
                  </span>
                </div>
              </div>
            </div>
            <div class="field" v-if="productApplicationIsNew">
              <label>品牌/型号补充（选填）</label>
              <input v-model="newProductApplicationForm.modelNote" placeholder="例如：双镜头套装，可日租" />
            </div>
            <div class="field">
              <label>申请说明</label>
              <textarea v-model="productApplicationReason" placeholder="例如：我有该设备，可接单。" />
            </div>
            <button class="btn btn-primary feedback-submit" :disabled="productApplicationSubmitting" @click="submitProductApplication">
              {{ productApplicationSubmitting ? '提交中...' : '提交商品申请' }}
            </button>
          </div>

          <div class="feedback-form-card" v-if="feedbackCenterMode === 'feedback'">
            <div class="field">
              <label>反馈类型</label>
              <div class="feedback-choice-group" role="radiogroup" aria-label="反馈类型">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="feedbackMode === 'issue'"
                  :class="['feedback-choice', { active: feedbackMode === 'issue' }]"
                  @click="feedbackMode = 'issue'"
                >
                  问题反馈
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="feedbackMode === 'price_suggestion'"
                  :class="['feedback-choice', { active: feedbackMode === 'price_suggestion' }]"
                  @click="feedbackMode = 'price_suggestion'"
                >
                  价格反馈
                </button>
              </div>
            </div>

            <template v-if="feedbackMode === 'issue'">
              <div class="field">
                <label>问题类型</label>
                <div class="feedback-choice-group" role="radiogroup" aria-label="问题类型">
                  <button
                    v-for="option in issueFeedbackOptions"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="issueFeedbackForm.issueType === option.value"
                    :class="['feedback-choice', { active: issueFeedbackForm.issueType === option.value }]"
                    @click="issueFeedbackForm.issueType = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <p class="feedback-field-hint">{{ issueFeedbackHelpText }}</p>
              </div>
              <div class="field">
                <label>问题描述</label>
                <textarea v-model="issueFeedbackForm.description" :placeholder="issueFeedbackPlaceholder" />
              </div>
              <button class="btn btn-primary feedback-submit" :disabled="feedbackSubmitting" @click="submitIssueFeedback">
                {{ feedbackSubmitting ? '提交中...' : issueFeedbackSubmitText }}
              </button>
            </template>

            <template v-if="feedbackMode === 'price_suggestion'">
              <div class="field">
                <label>商品</label>
                <div class="feedback-product-picker" :class="{ open: priceProductPickerOpen }">
                  <div
                    class="feedback-product-input-wrap"
                    @click="openPriceProductPicker()"
                  >
                    <input
                      v-model="priceFeedbackForm.product"
                      placeholder="请选择或输入商品"
                      autocomplete="off"
                      role="combobox"
                      aria-controls="feedback-product-listbox"
                      :aria-expanded="priceProductPickerOpen"
                      :readonly="mobilePickerMode"
                      @focus="openPriceProductPickerFromFocus"
                      @click="openPriceProductPicker()"
                      @blur="closePriceProductPickerSoon"
                      @input="handlePriceProductInput"
                      @change="syncPriceFeedbackRuleId"
                    />
                  </div>
                  <div
                    v-if="priceProductPickerOpen"
                    id="feedback-product-listbox"
                    class="feedback-product-panel"
                    role="listbox"
                  >
                    <button
                      v-for="product in filteredFeedbackProductOptions"
                      :key="product.rule_id"
                      type="button"
                      role="option"
                      :aria-selected="priceFeedbackForm.product === product.product"
                      :class="['feedback-product-option', { active: priceFeedbackForm.product === product.product }]"
                      @mousedown.prevent="selectFeedbackProduct(product)"
                    >
                      <span>
                        <strong>{{ product.product }}</strong>
                      </span>
                      <em v-if="priceFeedbackForm.product === product.product">已选</em>
                    </button>
                    <div v-if="filteredFeedbackProductOptions.length === 0" class="feedback-product-empty">
                      没有找到商品，可直接输入商品名
                    </div>
                  </div>
                  <div
                    v-if="priceProductPickerOpen"
                    class="feedback-product-mobile-backdrop"
                    @click="closePriceProductPicker"
                  ></div>
                  <div v-if="priceProductPickerOpen" class="feedback-product-mobile-sheet" role="dialog" aria-label="选择商品">
                    <div class="feedback-product-mobile-header">
                      <strong>选择商品</strong>
                      <button type="button" aria-label="关闭" @click="closePriceProductPicker">&times;</button>
                    </div>
                    <div class="feedback-product-mobile-search">
                      <input
                        v-model="priceFeedbackForm.product"
                        placeholder="搜索或输入商品"
                        autocomplete="off"
                        @input="handlePriceProductInput"
                        @change="syncPriceFeedbackRuleId"
                      />
                    </div>
                    <div class="feedback-product-mobile-list">
                      <button
                        v-for="product in filteredFeedbackProductOptions"
                        :key="`mobile-${product.rule_id}`"
                        type="button"
                        :class="['feedback-product-option', { active: priceFeedbackForm.product === product.product }]"
                        @click="selectFeedbackProduct(product)"
                      >
                        <span>
                          <strong>{{ product.product }}</strong>
                        </span>
                        <em v-if="priceFeedbackForm.product === product.product">已选</em>
                      </button>
                      <div v-if="filteredFeedbackProductOptions.length === 0" class="feedback-product-empty">
                        没有找到商品，可直接输入商品名
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="field">
                <label>当前问题</label>
                <div class="feedback-choice-group" role="radiogroup" aria-label="当前问题">
                  <button
                    v-for="option in priceIssueFeedbackOptions"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="priceFeedbackForm.priceIssueType === option.value"
                    :class="['feedback-choice', { active: priceFeedbackForm.priceIssueType === option.value }]"
                    @click="selectPriceIssueFeedback(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div class="field" v-if="priceFeedbackRequiresPrice">
                <label>建议价格</label>
                <div class="price-input-wrap">
                  <input v-model="priceFeedbackForm.pricePerDay" type="number" inputmode="numeric" min="1" step="1" placeholder="例如 80" />
                  <span>元/天</span>
                </div>
              </div>
              <div class="field">
                <label>{{ priceFeedbackReasonLabel }}</label>
                <textarea v-model="priceFeedbackForm.reason" :placeholder="priceFeedbackReasonPlaceholder" />
              </div>
              <button class="btn btn-primary feedback-submit" :disabled="feedbackSubmitting" @click="submitPriceFeedback">
                {{ feedbackSubmitting ? '提交中...' : priceFeedbackSubmitText }}
              </button>
            </template>
          </div>

            <div
              v-if="feedbackLoading || submissionRecords.length > 0"
              class="feedback-record-panel"
              :class="{ 'is-compact': !submissionRecordsExpanded }"
            >
              <div class="feedback-record-header">
                <button
                  type="button"
                  class="feedback-record-summary"
                  :disabled="!hasHiddenSubmissionRecords"
                  :aria-expanded="submissionRecordsExpanded"
                  @click="toggleSubmissionRecords"
                >
                  <span>提交记录</span>
                  <em>{{ feedbackLoading ? '加载中' : `${submissionRecords.length} 条 · ${submissionRecordsExpanded ? '收起' : '展开'}` }}</em>
                </button>
              </div>
              <template v-if="submissionRecordsExpanded">
                <div v-if="feedbackLoading" class="notif-empty">提交记录加载中...</div>
                <div v-else-if="submissionRecords.length === 0" class="notif-empty">暂无提交记录。</div>
                <div v-else class="feedback-record-list">
                  <div v-for="record in visibleSubmissionRecords" :key="record.id" class="feedback-record-item">
                    <div>
                      <strong>{{ record.typeText }} · {{ record.title }}</strong>
                      <span>{{ record.summary }}</span>
                      <small>{{ formatDispatchTime(record.createdAt) }}</small>
                    </div>
                    <em :class="`feedback-status ${record.status}`">{{ record.statusText }}</em>
                  </div>
                </div>
              </template>
            </div>
        </section>

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
