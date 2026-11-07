import {
  navigationPaths,
  type CopilotAction,
  type CopilotIntent,
  type NavigationPageId,
  type Role,
} from '@hr/shared'
import { GUIDE_PAGES } from '../guide/pages.js'
import { ACTION_CAPABILITY, ACTION_DESCRIPTIONS, DESTRUCTIVE, actionsFor } from './actions.js'
import { INTENT_DESCRIPTIONS, intentsFor } from './intents.js'
import type { CapabilityName } from '../permissions.js'

export type CopilotCapabilityKind = 'ui' | 'read' | 'action'
export type CopilotCapabilityOwner = 'main-copilot' | 'payroll-agent' | 'knowledge-rag'

/**
 * A transport-neutral declaration of something the Copilot may offer.
 *
 * It intentionally names the existing executor instead of implementing a new
 * one. The route/service continues to validate, authorize and perform the
 * operation; this registry tells text, voice and MCP how to discover it.
 */
export interface CopilotCapability {
  id: string
  kind: CopilotCapabilityKind
  owner: CopilotCapabilityOwner
  label: string
  permission: CapabilityName | null
  requiresConfirmation: boolean
  execution: {
    channel: 'uiEffect' | 'intent' | 'action'
    handler: string
  }
  input: string[]
  result: string
}

const PAYROLL_INTENTS = new Set<CopilotIntent>([
  'payrollInsights',
  'payrollReadiness',
  'payrollRunSummary',
  'payrollAuditSummary',
  'payrollFindings',
])

const PAYROLL_ACTIONS = new Set<CopilotAction>([
  'setSalary',
  'createPayrollAdjustment',
  'approvePayrollAdjustment',
  'reviewPayrollFinding',
  'runPayroll',
  'auditPayroll',
  'approvePayroll',
])

const actionInputs: Partial<Record<CopilotAction, string[]>> = {
  openScreen: ['screen'],
  filterScreen: ['screen', 'text?', 'role?', 'stage?'],
  scrollPage: ['scrollTarget'],
  openEmployeeFile: ['personName | employeeNumber'],
  requestLeave: ['leaveKind', 'startDate', 'endDate', 'text?'],
  requestDocument: ['documentKind', 'text?'],
  decideRequest: ['personName', 'decision', 'text?'],
  setSalary: ['personName | employeeNumber', 'amount', 'startDate?'],
  createPayrollAdjustment: ['personName | employeeNumber', 'payrollAdjustmentKind', 'amount', 'text', 'startDate?'],
  approvePayrollAdjustment: ['personName | employeeNumber', 'payrollAdjustmentKind?'],
  reviewPayrollFinding: ['personName | employeeNumber', 'decision', 'text?'],
  generateInterview: ['personName'],
  reviewInterviewQuestion: ['personName', 'questionNumber', 'decision', 'text?'],
  evaluateInterview: ['personName'],
  sendInterview: ['personName', 'opensAt', 'durationMinutes'],
  addEmployee: ['personName', 'email', 'employeeNumberNew', 'jobTitle', 'department', 'role'],
  updateEmployeeDetails: ['personName | employeeNumber', 'jobTitle?', 'department?'],
  generateJobDescription: ['title', 'text?'],
  regenerateJobDescriptionSection: ['title', 'jobDescriptionSection', 'text?'],
  addKnowledgeText: ['title', 'text'],
  deleteKnowledgeText: ['title'],
  createJob: ['title', 'department', 'location?', 'employmentType?'],
  updateJobOpening: ['title', 'location?', 'employmentType?', 'startDate?'],
  moveApplication: ['personName', 'stage'],
  addCalendarEvent: ['title', 'startDate', 'endDate?'],
  updateAnnouncement: ['title', 'text'],
  changeEmployeeRole: ['personName | employeeNumber', 'role'],
}

function ownerForIntent(intent: CopilotIntent): CopilotCapabilityOwner {
  if (PAYROLL_INTENTS.has(intent)) return 'payroll-agent'
  if (intent === 'knowledge') return 'knowledge-rag'
  return 'main-copilot'
}

function ownerForAction(action: CopilotAction): CopilotCapabilityOwner {
  return PAYROLL_ACTIONS.has(action) ? 'payroll-agent' : 'main-copilot'
}

function pageCapabilities(role: Role): { pages: { id: NavigationPageId; path: string; title: { en: string; ar: string } }[]; registry: CopilotCapability[] } {
  const pages = GUIDE_PAGES.flatMap((page) => {
    if (!page.roles.includes(role)) return []
    const entry = Object.entries(navigationPaths).find(([, path]) => path === page.path)
    if (!entry) return []
    return [{ id: entry[0] as NavigationPageId, path: page.path, title: page.title }]
  })

  return {
    pages,
    registry: pages.map((page) => ({
      id: `ui.navigate.${page.id}`,
      kind: 'ui' as const,
      owner: 'main-copilot' as const,
      label: `Open ${page.title.en}`,
      permission: null,
      requiresConfirmation: false,
      execution: { channel: 'uiEffect' as const, handler: `navigate:${page.id}` },
      input: [],
      result: `Navigation effect for ${page.path}`,
    })),
  }
}

/**
 * The Copilot's discoverable surface.
 *
 * This is deliberately metadata, never an authority.  Routes, queries and
 * `runAction` remain the enforcement points.  Keeping this registry derived
 * from those existing allowlists prevents a second, drifting list of what the
 * assistant claims it can do.
 */
export function capabilitiesFor(role: Role) {
  const { pages, registry: ui } = pageCapabilities(role)
  const reads = intentsFor(role)
    .filter((intent) => !['doAction', 'greeting'].includes(intent))
    .map((intent) => ({ id: intent, description: INTENT_DESCRIPTIONS[intent] }))
  const actions = actionsFor(role).map((action) => ({
    id: action,
    description: ACTION_DESCRIPTIONS[action],
    capability: ACTION_CAPABILITY[action],
    requiresConfirmation: DESTRUCTIVE.has(action),
  }))

  const registry: CopilotCapability[] = [
    ...ui,
    ...reads.map((read) => ({
      id: `read.${read.id}`,
      kind: 'read' as const,
      owner: ownerForIntent(read.id),
      label: read.description,
      permission: null,
      requiresConfirmation: false,
      execution: { channel: 'intent' as const, handler: `executeIntent:${read.id}` },
      input: ['question', 'structured intent arguments when available'],
      result: 'Role-scoped structured read result',
    })),
    ...actions.map((action) => ({
      id: `action.${action.id}`,
      kind: 'action' as const,
      owner: ownerForAction(action.id),
      label: action.description,
      permission: action.capability,
      requiresConfirmation: action.requiresConfirmation,
      execution: { channel: 'action' as const, handler: `runAction:${action.id}` },
      input: actionInputs[action.id] ?? ['action-specific resolved parameters'],
      result: 'Backend-confirmed action outcome and optional UI effect',
    })),
  ]

  return {
    version: 1,
    pages,
    reads,
    actions,
    registry,
  }
}
