<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { api, type MerchantProduct } from './api'

const token = ref(localStorage.getItem('merchant_token') || '')
const loginForm = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
const products = ref<MerchantProduct[]>([])
const expandingProduct = ref<string | null>(null)
const pauseForm = reactive({ reason: '' })
const submittingProduct = ref<string | null>(null)

const subject = computed(() => {
  try {
    const payload = JSON.parse(atob(token.value.split('.')[0]))
    return payload.sub || ''
  } catch {
    return ''
  }
})

const isLoggedIn = computed(() => Boolean(token.value))

const enabledProducts = computed(() => products.value.filter((p) => p.available))
const disabledProducts = computed(() => products.value.filter((p) => !p.available))

if (isLoggedIn.value) {
  api.setToken(token.value)
  void refreshProducts()
}

async function login() {
  await run(async () => {
    const result = await api.login(loginForm.username, loginForm.password)
    if (result.role !== 'merchant') {
      throw new Error('此账号不是商户账号')
    }
    token.value = result.access_token
    localStorage.setItem('merchant_token', result.access_token)
    api.setToken(result.access_token)
    await refreshProducts()
  })
}

async function refreshProducts() {
  await run(async () => {
    products.value = await api.listProducts()
  })
}

function toggleExpand(ruleId: string) {
  if (expandingProduct.value === ruleId) {
    expandingProduct.value = null
  } else {
    expandingProduct.value = ruleId
    pauseForm.reason = ''
    const product = products.value.find((p) => p.rule_id === ruleId)
    if (product?.reason) {
      pauseForm.reason = product.reason
    }
  }
}

async function setAvailable(ruleId: string) {
  submittingProduct.value = ruleId
  try {
    const updated = await api.updateAvailability(ruleId, true)
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) products.value[idx] = updated
    expandingProduct.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败'
  } finally {
    submittingProduct.value = null
  }
}

async function setUnavailable(ruleId: string) {
  submittingProduct.value = ruleId
  try {
    const updated = await api.updateAvailability(ruleId, false, pauseForm.reason || undefined)
    const idx = products.value.findIndex((p) => p.rule_id === ruleId)
    if (idx !== -1) products.value[idx] = updated
    expandingProduct.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败'
  } finally {
    submittingProduct.value = null
  }
}

function logout() {
  token.value = ''
  localStorage.removeItem('merchant_token')
  api.setToken('')
  products.value = []
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function run(task: () => Promise<void>) {
  loading.value = true
  error.value = ''
  try {
    await task()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '请求失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="shell">
    <div v-if="isLoggedIn" class="header">
      <div>
        <h1>商户管理</h1>
        <p class="header-meta">{{ subject }} · 共 {{ products.length }} 个商品</p>
      </div>
      <button class="btn outline" @click="logout">退出登录</button>
    </div>

    <p v-if="error" class="alert">{{ error }}</p>

    <section v-if="!isLoggedIn" class="login-card card">
      <div>
        <h1>商户登录</h1>
        <p>请使用平台分配的商户账号登录，管理商品库存接单状态。</p>
      </div>
      <label class="field">
        账号
        <input v-model="loginForm.username" placeholder="请输入商户账号" />
      </label>
      <label class="field">
        密码
        <input v-model="loginForm.password" type="password" placeholder="请输入密码" />
      </label>
      <button class="btn primary full" :disabled="loading" @click="login">登录</button>
    </section>

    <template v-else>
      <div v-if="loading && products.length === 0" class="empty">
        <strong>加载中...</strong>
      </div>

      <div v-else-if="products.length === 0" class="empty">
        <strong>暂无商品</strong>
        <p>平台尚未为您分配任何商品权限，请联系管理员。</p>
      </div>

      <template v-else>
        <div v-if="enabledProducts.length > 0" class="product-list" style="margin-bottom: 24px">
          <article
            v-for="product in enabledProducts"
            :key="product.rule_id"
            class="product-row card"
          >
            <div class="product-main">
              <div class="product-name">{{ product.product }}</div>
              <div class="product-keywords">
                <span
                  v-for="kw in product.keywords"
                  :key="kw"
                  class="product-keyword-tag"
                >{{ kw }}</span>
              </div>
              <div class="product-meta">{{ formatTime(product.updated_at) }}</div>
            </div>
            <div class="product-side">
              <span class="badge ok">可接单</span>
              <button
                class="btn outline"
                :disabled="submittingProduct === product.rule_id"
                @click="toggleExpand(product.rule_id)"
              >
                {{ expandingProduct === product.rule_id ? '取消' : '暂停接单' }}
              </button>
            </div>
          </article>
          <div v-if="expandingProduct" class="expand-row">
            <label>
              暂停原因（选填）
              <textarea
                v-model="pauseForm.reason"
                placeholder="例如：无库存、设备维修"
              />
            </label>
            <div class="expand-actions">
              <button
                class="btn primary"
                :disabled="submittingProduct === expandingProduct"
                @click="setUnavailable(expandingProduct)"
              >
                确认暂停
              </button>
            </div>
          </div>
        </div>

        <div v-if="disabledProducts.length > 0" class="product-list">
          <article
            v-for="product in disabledProducts"
            :key="product.rule_id"
            class="product-row card"
          >
            <div class="product-main">
              <div class="product-name">{{ product.product }}</div>
              <div class="product-keywords">
                <span
                  v-for="kw in product.keywords"
                  :key="kw"
                  class="product-keyword-tag"
                >{{ kw }}</span>
              </div>
              <div class="product-meta">
                {{ product.reason || '无库存' }} · {{ formatTime(product.updated_at) }}
              </div>
            </div>
            <div class="product-side">
              <span class="badge danger">已暂停</span>
              <button
                class="btn outline"
                :disabled="submittingProduct === product.rule_id"
                @click="setAvailable(product.rule_id)"
              >
                恢复接单
              </button>
            </div>
          </article>
        </div>
      </template>
    </template>
  </div>
</template>
