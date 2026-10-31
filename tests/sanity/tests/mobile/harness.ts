// SPDX-License-Identifier: EPL-2.0
import MobileHarness from './MobileHarness.svelte'

const target = document.getElementById('mobile-harness')
if (target === null) throw new Error('Mobile harness mount is missing')

new MobileHarness({
  target,
  props: { adapter: new URLSearchParams(window.location.search).get('adapter') ?? 'candidate' }
})
