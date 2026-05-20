<template>
  <component
    :is="tag"
    ref="elRef"
    :class="classes"
    :style="rootStyle"
    :aria-label="text"
  >
    <span
      v-for="(segment, index) in segments"
      :key="`${text}-${index}-${segment}`"
      class="split-reveal-char"
      :style="{ '--split-index': index }"
      aria-hidden="true"
    >{{ segment === ' ' ? '\u00A0' : segment }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'

type SplitRevealTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span'

interface SplitRevealTextProps {
  text: string
  className?: string
  delay?: number
  duration?: number
  splitType?: 'chars' | 'words'
  threshold?: number
  rootMargin?: string
  tag?: SplitRevealTag
  textAlign?: CSSProperties['textAlign']
}

const props = withDefaults(defineProps<SplitRevealTextProps>(), {
  className: '',
  delay: 42,
  duration: 0.92,
  splitType: 'chars',
  threshold: 0.1,
  rootMargin: '-24px',
  tag: 'p',
  textAlign: 'left',
})

const elRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
let observer: IntersectionObserver | null = null

const segments = computed(() => {
  if (props.splitType === 'words') {
    return props.text.split(/(\s+)/).filter(Boolean)
  }

  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
    return Array.from(segmenter.segment(props.text), (item) => item.segment)
  }

  return Array.from(props.text)
})

const classes = computed(() => [
  'split-reveal',
  props.className,
  { 'is-visible': isVisible.value },
])

const rootStyle = computed(() => ({
  textAlign: props.textAlign,
  '--split-duration': `${props.duration}s`,
  '--split-stagger': `${props.delay}ms`,
}))

function reveal() {
  isVisible.value = true
  observer?.disconnect()
  observer = null
}

onMounted(() => {
  if (!elRef.value) return

  if (!('IntersectionObserver' in window)) {
    reveal()
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reveal()
      }
    },
    {
      threshold: props.threshold,
      rootMargin: props.rootMargin,
    },
  )
  observer.observe(elRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>
