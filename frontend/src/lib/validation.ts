import { z } from 'zod'

export const proposalSchema = z.object({
  id: z.number(),
  title: z.string(),
  startup_details: z.string(),
  description: z.string().optional().nullable(),
  category: z.string(),
  required_funding: z.union([z.number(), z.string()]),
  timeline: z.string().optional().nullable(),
  document_name: z.string().optional().nullable(),
  pitch_video_url: z.string().optional().nullable(),
  status: z.string(),
  milestone: z.string().optional().nullable(),
  entrepreneur: z.number().optional().nullable(),
  entrepreneur_email: z.string().email().optional().nullable(),
})

export const signalSchema = z.object({
  id: z.number(),
  proposal: z.number(),
  signal_type: z.string(),
  status: z.string(),
  message: z.string().optional().nullable(),
  investor_email: z.string().email().optional().nullable(),
  entrepreneur_email: z.string().email().optional().nullable(),
})

export const transactionSchema = z.object({
  id: z.number(),
  proposal: z.number(),
  action: z.string(),
  method: z.string(),
  amount: z.union([z.number(), z.string()]),
  notes: z.string().optional().nullable(),
  created_at: z.string().optional(),
})
