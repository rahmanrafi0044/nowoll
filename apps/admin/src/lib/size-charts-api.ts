import type { AdminSizeChart } from '@nowoll/types'
import type { SizeChartInput } from '@nowoll/validation'
import { call } from '@/lib/api'

// Admin → Size charts (38f) — apps/api/src/size-charts.

export const fetchSizeCharts = () => call<AdminSizeChart[]>('GET', '/admin/size-charts')

export const fetchSizeChart = (id: string) =>
  call<AdminSizeChart>('GET', `/admin/size-charts/${id}`)

export const createSizeChart = (body: SizeChartInput) =>
  call<AdminSizeChart>('POST', '/admin/size-charts', body)

export const updateSizeChart = (id: string, body: SizeChartInput) =>
  call<AdminSizeChart>('PATCH', `/admin/size-charts/${id}`, body)
