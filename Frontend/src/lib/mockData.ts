// Mock data for legal workflow UI

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type Case = {
  id: string;
  title: string;
  subtitle: string;
  lawyer: string;
  createdAt: string;
  status: 'Aktiv' | 'Lezárt' | 'Függőben';
};

export type TimelineEvent = {
  id: string;
  type: 'document_upload' | 'document_edit' | 'instruction' | 'task_created' | 'client_added' | 'review_needed' | 'ai_detection' | 'signature' | 'status_change' | 'submission';
  title: string;
  description: string;
  timestamp: string;
  author: string;
  avatarInitials: string;
  documentName?: string;
  statusLabel?: string;
};

export type Task = {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  priority: 'Magas' | 'Közepes' | 'Alacsony';
  status: 'Todo' | 'InProgress' | 'Done';
};

export type Instruction = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  author: string;
};

export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'Vevő' | 'Eladó' | 'Megbízó';
};

export type AiInsight = {
  id: string;
  type: 'risk' | 'complication' | 'suggestion';
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
};

// Current mock user (would come from /api/v1/auth/me)
export const currentUser: User = {
  id: '1',
  name: 'Dr. Kovács Marianna',
  email: 'kovacs.marianna@adminiculum.hu',
  role: 'Ügyvéd'
};

// Mock case data
export const mockCase: Case = {
  id: 'UGY-2026-0042',
  title: 'XY utca - Ingatlanadásvétel',
  subtitle: 'Adásvételi szerződés',
  lawyer: 'Dr. Kovács Marianna',
  createdAt: '2026. március 10.',
  status: 'Aktiv'
};

// Mock timeline events
export const mockTimelineEvents: TimelineEvent[] = [
  {
    id: '1',
    type: 'document_upload',
    title: 'Dokumentum feltöltve',
    description: 'Az adásvételi szerződés vázlata feltöltésre került.',
    timestamp: '2026. március 17., 14:32',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM',
    documentName: 'adasvételi_szerződés_vázlat.docx'
  },
  {
    id: '2',
    type: 'ai_detection',
    title: 'AI észlelés',
    description: 'A rendszer potenciális kockázatot azonosított a szerződésben: hiányzó feltétel a birtokbaadás határidejéről.',
    timestamp: '2026. március 17., 14:35',
    author: 'Adminiculum AI',
    avatarInitials: 'AI',
    statusLabel: 'Kockázat'
  },
  {
    id: '3',
    type: 'instruction',
    title: 'Ügyvédi instrukció',
    description: 'Kérem ellenőrizni a tulajdoni lap hitelességét és az ingatlan tehermentességét.',
    timestamp: '2026. március 16., 09:15',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM'
  },
  {
    id: '4',
    type: 'task_created',
    title: 'Feladat létrehozva',
    description: 'Tulajdoni lap lekérése az ingatlanról.',
    timestamp: '2026. március 16., 09:20',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM',
    statusLabel: 'Folyamatban'
  },
  {
    id: '5',
    type: 'client_added',
    title: 'Ügyfél hozzáadva',
    description: 'Nagy János (Vevő) hozzáadva az ügyhöz.',
    timestamp: '2026. március 15., 16:45',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM'
  },
  {
    id: '6',
    type: 'document_edit',
    title: 'Dokumentum módosítva',
    description: 'A vevői adásvételi szerződés módosításra került a kliens kérése alapján.',
    timestamp: '2026. március 14., 11:20',
    author: 'Szabó Péter (asszisztens)',
    avatarInitials: 'SP',
    documentName: 'adasvételi_szerződés_módosított.docx'
  },
  {
    id: '7',
    type: 'review_needed',
    title: 'Review szükséges',
    description: 'A szerződés jelenlegi állapota jóváhagyásra vár a vezető ügyvédtől.',
    timestamp: '2026. március 13., 10:00',
    author: 'Rendszer',
    avatarInitials: 'R',
    statusLabel: 'Review szükséges'
  },
  {
    id: '8',
    type: 'status_change',
    title: 'Státuszváltozás',
    description: 'Ügy státusza \"Függőben\" -ról \"Aktiv\" -ra módosítva.',
    timestamp: '2026. március 10., 09:00',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM'
  },
  {
    id: '9',
    type: 'submission',
    title: 'Beküldés',
    description: 'Ügy létrehozva a rendszerben.',
    timestamp: '2026. március 10., 08:45',
    author: 'Dr. Kovács Marianna',
    avatarInitials: 'KM'
  }
];

// Mock tasks
export const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Tulajdoni lap lekérése',
    assignee: 'Szabó Péter',
    dueDate: '2026. március 20.',
    priority: 'Magas',
    status: 'InProgress'
  },
  {
    id: '2',
    title: 'Energia tanúsítvány beszerzése',
    assignee: 'Nagy János (ügyfél)',
    dueDate: '2026. március 25.',
    priority: 'Közepes',
    status: 'Todo'
  },
  {
    id: '3',
    title: 'Aláírási példányok előkészítése',
    assignee: 'Dr. Kovács Marianna',
    dueDate: '2026. március 28.',
    priority: 'Magas',
    status: 'Todo'
  },
  {
    id: '4',
    title: 'Földhivatali beadás előkészítése',
    assignee: 'Szabó Péter',
    dueDate: '2026. április 1.',
    priority: 'Közepes',
    status: 'Todo'
  }
];

// Mock instructions
export const mockInstructions: Instruction[] = [
  {
    id: '1',
    title: 'Tulajdoni lap ellenőrzése',
    description: 'Kérem ellenőrizni a tulajdoni lap hitelességét a földhivatal online rendszerében. Az ingatlan tehermentes legyen a adásvétel időpontjában.',
    createdAt: '2026. március 16.',
    author: 'Dr. Kovács Marianna'
  },
  {
    id: '2',
    title: 'Végleges feltételek egyeztetése',
    description: 'A vevő és eladó közötti egyeztetés után rögzíteni kell a végleges szerződéses feltételeket, különös tekintettel a birtokbaadás időpontjára és feltételeire.',
    createdAt: '2026. március 14.',
    author: 'Dr. Kovács Marianna'
  }
];

// Mock clients
export const mockClients: Client[] = [
  {
    id: '1',
    name: 'Nagy János',
    email: 'nagy.janos@email.hu',
    phone: '+36 20 123 4567',
    role: 'Vevő'
  },
  {
    id: '2',
    name: 'Kis Mária',
    email: 'kis.maria@email.hu',
    phone: '+36 30 987 6543',
    role: 'Eladó'
  }
];

// Mock AI insights
export const mockAiInsights: AiInsight[] = [
  {
    id: '1',
    type: 'risk',
    title: 'Hiányzó birtokbaadási feltétel',
    description: 'A szerződés jelenleg nem tartalmaz explicit birtokbaadási határidőt. Javasolt a 2026. április 15-i határidő rögzítése.',
    severity: 'high'
  },
  {
    id: '2',
    type: 'complication',
    title: 'Energia tanúsítvány hiányzik',
    description: 'Az eladó még nem töltötte fel az ingatlan energia tanúsítványát. A szerződéskötéshez szükséges.',
    severity: 'medium'
  }
];

// Navigation items
export const navItems = [
  { id: 'dashboard', label: 'Műszerfal', icon: 'grid' },
  { id: 'cases', label: 'Ügyek', icon: 'folder' },
  { id: 'clause-library', label: 'Clause Library', icon: 'file' },
  { id: 'tasks', label: 'Feladatok', icon: 'briefcase' },
  { id: 'reviews', label: 'Review sor', icon: 'file' },
  { id: 'documents-compare', label: 'Verzió-összevetés', icon: 'file' },
  { id: 'notifications', label: 'Kommunikáció', icon: 'bell' },
  { id: 'time-entries', label: 'Munkaórák', icon: 'clock' },
  { id: 'clients', label: 'Ügyfelek', icon: 'file' },
  { id: 'calendar', label: 'Határidők', icon: 'calendar' },
  { id: 'settings', label: 'Beállítások', icon: 'settings' }
];

// Case tabs
export const caseTabs = [
  { id: 'timeline', label: 'Időrend' },
  { id: 'documents', label: 'Dokumentumok' },
  { id: 'clients', label: 'Ügyfelek' },
  { id: 'related', label: 'Kapcsolódó ügyek' }
];

// Quick stats for dashboard
export type QuickStat = {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
};

export const quickStats: QuickStat[] = [
  { label: 'Aktív ügyek', value: 12, change: '+2', trend: 'up' },
  { label: 'Lejáró feladatok', value: 3, change: '-1', trend: 'down' },
  { label: 'Függőben lévő review', value: 5, change: '0', trend: 'neutral' },
  { label: 'Új dokumentumok', value: 8, change: '+4', trend: 'up' }
];

// Dashboard tasks (today's tasks)
export type DashboardTask = {
  id: string;
  title: string;
  caseName: string;
  dueDate: string;
  priority: 'Magas' | 'Közepes' | 'Alacsony';
};

export const dashboardTasks: DashboardTask[] = [
  { id: '1', title: 'Tulajdoni lap ellenőrzése', caseName: 'XY utca - Ingatlanadásvétel', dueDate: 'Ma', priority: 'Magas' },
  { id: '2', title: 'Szerződés jóváhagyása', caseName: 'ABC Kft. - Társasági szerződés', dueDate: 'Ma', priority: 'Magas' },
  { id: '3', title: 'Ügyfél értesítése', caseName: 'Kiss Bt. - Cégbírósági beadás', dueDate: 'Holnap', priority: 'Közepes' },
  { id: '4', title: 'Dokumentumok rendezése', caseName: 'Nagy Properties - Ingatlanadásvétel', dueDate: 'Holnap', priority: 'Alacsony' }
];

// Recent cases for dashboard
export type RecentCase = {
  id: string;
  name: string;
  type: string;
  lastActivity: string;
  status: 'Aktiv' | 'Lezárt' | 'Függőben';
};

export const recentCases: RecentCase[] = [
  { id: '1', name: 'XY utca - Ingatlanadásvétel', type: 'Adásvétel', lastActivity: '2 órája', status: 'Aktiv' },
  { id: '2', name: 'ABC Kft. - Társasági szerződés', type: 'Cégjog', lastActivity: '5 órája', status: 'Aktiv' },
  { id: '3', name: 'Kiss Bt. - Cégbírósági beadás', type: 'Cégjog', lastActivity: 'Tegnap', status: 'Függőben' },
  { id: '4', name: 'Nagy Properties - Ingatlanadásvétel', type: 'Adásvétel', lastActivity: 'Tegnap', status: 'Aktiv' },
  { id: '5', name: 'Szabó Zrt. - Alapítás', type: 'Cégjog', lastActivity: '3 napja', status: 'Lezárt' }
];

// Dashboard timeline events (compact)
export type DashboardEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
};

export const dashboardEvents: DashboardEvent[] = [
  { id: '1', type: 'document', title: 'Dokumentum feltöltve', description: 'adasvételi_szerződés_vázlat.docx', timestamp: '2 órája' },
  { id: '2', type: 'task', title: 'Feladat létrehozva', description: 'Tulajdoni lap lekérése', timestamp: '5 órája' },
  { id: '3', type: 'client', title: 'Ügyfél hozzáadva', description: 'Nagy János (Vevő)', timestamp: 'Tegnap' },
  { id: '4', type: 'status', title: 'Státuszváltozás', description: 'Ügy "Függőben" -> "Aktiv"', timestamp: 'Tegnap' }
];

// All cases for cases list
export type CaseListItem = {
  id: string;
  name: string;
  type: string;
  lawyer: string;
  status: 'Aktiv' | 'Lezárt' | 'Függőben';
  lastActivity: string;
  deadline?: string;
};

export const allCases: CaseListItem[] = [
  { id: '1', name: 'XY utca - Ingatlanadásvétel', type: 'Adásvétel', lawyer: 'Dr. Kovács Marianna', status: 'Aktiv', lastActivity: '2 órája', deadline: '2026. március 25.' },
  { id: '2', name: 'ABC Kft. - Társasági szerződés', type: 'Cégjog', lawyer: 'Dr. Szabó Péter', status: 'Aktiv', lastActivity: '5 órája', deadline: '2026. március 28.' },
  { id: '3', name: 'Kiss Bt. - Cégbírósági beadás', type: 'Cégjog', lawyer: 'Dr. Kovács Marianna', status: 'Függőben', lastActivity: 'Tegnap', deadline: '2026. március 30.' },
  { id: '4', name: 'Nagy Properties - Ingatlanadásvétel', type: 'Adásvétel', lawyer: 'Dr. Nagy Anna', status: 'Aktiv', lastActivity: 'Tegnap', deadline: '2026. április 1.' },
  { id: '5', name: 'Szabó Zrt. - Alapítás', type: 'Cégjog', lawyer: 'Dr. Szabó Péter', status: 'Lezárt', lastActivity: '3 napja' },
  { id: '6', name: 'Kovács Bt. - Módosítás', type: 'Cégjog', lawyer: 'Dr. Kovács Marianna', status: 'Aktiv', lastActivity: '1 hete', deadline: '2026. április 5.' },
  { id: '7', name: 'Tóth utca 15. - Ingatlanadásvétel', type: 'Adásvétel', lawyer: 'Dr. Nagy Anna', status: 'Aktiv', lastActivity: '1 hete', deadline: '2026. április 10.' },
  { id: '8', name: 'Birodalom Kft. - Fúzió', type: 'Cégjog', lawyer: 'Dr. Szabó Péter', status: 'Függőben', lastActivity: '2 hete' }
];

export type CaseHealthStat = {
  id: string;
  label: string;
  value: number;
  detail: string;
  trend: 'up' | 'down' | 'steady';
};

export const caseHealthStats: CaseHealthStat[] = [
  { id: 'health-1', label: 'Aktív ügyek', value: 28, detail: '3 új ügy a héten', trend: 'up' },
  { id: 'health-2', label: 'Lejáró határidők', value: 5, detail: '2 határidő 48 órán belül', trend: 'down' },
  { id: 'health-3', label: 'Review alatt', value: 4, detail: '2 jóváhagyásra vár', trend: 'steady' }
];

export type DeadlineItem = {
  id: string;
  caseName: string;
  task: string;
  dueDate: string;
  owner: string;
  urgency: 'high' | 'medium' | 'low';
};

export const upcomingDeadlines: DeadlineItem[] = [
  {
    id: 'dl-1',
    caseName: 'XY utca - Ingatlanadásvétel',
    task: 'Tulajdoni lap leadása',
    dueDate: '2026. március 28.',
    owner: 'Szabó Péter',
    urgency: 'high'
  },
  {
    id: 'dl-2',
    caseName: 'Kiss Bt. - Cégbírósági beadás',
    task: 'Bírósági díj befizetése',
    dueDate: '2026. március 30.',
    owner: 'Dr. Kovács Marianna',
    urgency: 'medium'
  },
  {
    id: 'dl-3',
    caseName: 'ABC Kft. - Társasági szerződés',
    task: 'Aláírók egyeztetése',
    dueDate: '2026. április 1.',
    owner: 'Nagy János',
    urgency: 'medium'
  }
];

export type AutomationSignal = {
  id: string;
  title: string;
  impact: string;
  detail: string;
};

export const automationSignals: AutomationSignal[] = [
  {
    id: 'opt-1',
    title: 'AI Kockázatjelző',
    impact: 'High',
    detail: 'Javasolt rögzíteni a birtokbaadás pontos feltételeit 2026. április 15-re.'
  },
  {
    id: 'opt-2',
    title: 'Automatizált jegyzőkönyv',
    impact: 'Medium',
    detail: 'A dokumentumokból létrehozott összefoglaló már 65%-ban automatikusan készült.'
  }
];

export type InterventionCard = {
  id: string;
  title: string;
  summary: string;
  intensity: 'critical' | 'review';
  meta: string;
};

export const interventionCards: InterventionCard[] = [
  {
    id: 'int-1',
    title: 'Critical signature variance on acquisition file',
    summary: 'Client-side amendment introduces conflicting transfer date language that requires senior counsel intervention before filing.',
    intensity: 'critical',
    meta: 'Case: XY utca - Ingatlanadasvetel'
  },
  {
    id: 'int-2',
    title: 'Review and approval for board minute revision',
    summary: 'AI flagged wording drift against prior approved clause set. Legal approval required to finalize outgoing packet.',
    intensity: 'review',
    meta: 'Case: ABC Kft. - Tarsasagi szerzodes'
  }
];

export type EditorialInsightCard = {
  id: string;
  title: string;
  summary: string;
  label: string;
};

export const editorialInsights: EditorialInsightCard[] = [
  {
    id: 'ed-1',
    title: 'Nuance shift in client escalation language',
    summary: 'Recent correspondence shows elevated urgency markers and contradictory obligations across two draft variants.',
    label: 'Language Risk'
  },
  {
    id: 'ed-2',
    title: 'Timeline pressure around registration deadline',
    summary: 'Case load distribution indicates a 3-day compression window for mandatory registry submission and approval signoff.',
    label: 'Temporal Signal'
  }
];

export type CasesTableRow = {
  id: string;
  caseId: string;
  client: string;
  matterName: string;
  leadCounsel: string;
  workflowStatus: 'Client Input' | 'Draft' | 'In Review' | 'Approved';
  practiceArea: 'Real Estate' | 'Corporate' | 'Litigation';
  riskLevel: 'Low' | 'Medium' | 'High';
};

export const casesTableRows: CasesTableRow[] = [
  {
    id: '1',
    caseId: 'AD-2026-0042',
    client: 'Nagy Janos',
    matterName: 'Property transfer and deed validation',
    leadCounsel: 'Dr. Kovacs Marianna',
    workflowStatus: 'In Review',
    practiceArea: 'Real Estate',
    riskLevel: 'High'
  },
  {
    id: '2',
    caseId: 'AD-2026-0055',
    client: 'ABC Kft.',
    matterName: 'Corporate bylaw amendment package',
    leadCounsel: 'Dr. Szabo Peter',
    workflowStatus: 'Draft',
    practiceArea: 'Corporate',
    riskLevel: 'Medium'
  },
  {
    id: '3',
    caseId: 'AD-2026-0061',
    client: 'Kiss Bt.',
    matterName: 'Litigation response filing',
    leadCounsel: 'Dr. Nagy Anna',
    workflowStatus: 'Client Input',
    practiceArea: 'Litigation',
    riskLevel: 'High'
  },
  {
    id: '4',
    caseId: 'AD-2026-0068',
    client: 'Szabo Zrt.',
    matterName: 'Registry compliance and closure memo',
    leadCounsel: 'Dr. Kovacs Marianna',
    workflowStatus: 'Approved',
    practiceArea: 'Corporate',
    riskLevel: 'Low'
  }
];

export type CaseDocument = {
  id: string;
  name: string;
  type: string;
  date: string;
  status: 'Ready' | 'Review Needed' | 'Archived';
  linkedTimelineId?: string;
  version?: string;
};

export type CaseDetailData = {
  caseId: string;
  client: string;
  matterName: string;
  leadCounsel: string;
  workflowStatus: string;
  practiceArea: string;
  riskLevel: string;
  caseNav: string;
  createdDate: string;
  lastActivity: string;
  deadline?: string;
  description: string;
  timeline: TimelineEvent[];
  aiInsights: AiInsight[];
  relatedDocuments: CaseDocument[];
  partnerInstructions: Instruction[];
};

export const caseDetailsData: Record<string, CaseDetailData> = {
  'AD-2026-0042': {
    caseId: 'AD-2026-0042',
    client: 'Nagy Janos',
    matterName: 'Property transfer and deed validation',
    leadCounsel: 'Dr. Kovacs Marianna',
    workflowStatus: 'In Review',
    practiceArea: 'Real Estate',
    riskLevel: 'High',
    caseNav: 'timeline',
    createdDate: '2026-03-10',
    lastActivity: '2 hours ago',
    deadline: '2026-03-25',
    description: 'Residential property transfer involving a 120 sqm apartment in Budapest District XI. The transaction includes validation of title deeds and resolution of existing encumbrances.',
    timeline: mockTimelineEvents,
    aiInsights: mockAiInsights,
    relatedDocuments: [
      { id: 'doc-1', name: 'adasveteli_szerzodes_vazlat.docx', type: 'Contract', date: '2026-03-17', status: 'Review Needed', linkedTimelineId: '1', version: 'v2' },
      { id: 'doc-2', name: 'tulajdoni_lap.pdf', type: 'Title Deed', date: '2026-03-16', status: 'Ready', linkedTimelineId: '4', version: 'original' },
      { id: 'doc-3', name: 'energia_tanusitvany.pdf', type: 'Certificate', date: '2026-03-14', status: 'Ready', version: 'original' },
      { id: 'doc-4', name: 'adasveteli_szerzodes_final.docx', type: 'Contract', date: '2026-03-10', status: 'Archived', version: 'v1' },
    ],
    partnerInstructions: mockInstructions,
  },
  'AD-2026-0055': {
    caseId: 'AD-2026-0055',
    client: 'ABC Kft.',
    matterName: 'Corporate bylaw amendment package',
    leadCounsel: 'Dr. Szabo Peter',
    workflowStatus: 'Draft',
    practiceArea: 'Corporate',
    riskLevel: 'Medium',
    caseNav: 'timeline',
    createdDate: '2026-03-12',
    lastActivity: '5 hours ago',
    deadline: '2026-03-28',
    description: 'Comprehensive bylaw amendment for ABC Kft. including changes to voting rights, board composition, and profit distribution mechanisms.',
    timeline: [
      {
        id: '1',
        type: 'document_upload',
        title: 'Draft amendments uploaded',
        description: 'Initial bylaw draft prepared for client review.',
        timestamp: '2026. március 17., 10:00',
        author: 'Dr. Szabó Péter',
        avatarInitials: 'SP',
        documentName: 'tarsasagi_szabalyzat_modositas_v1.docx'
      },
      {
        id: '2',
        type: 'instruction',
        title: 'Client consultation scheduled',
        description: 'Meeting with board members to discuss proposed changes.',
        timestamp: '2026. március 15., 14:00',
        author: 'Dr. Szabó Péter',
        avatarInitials: 'SP'
      },
      {
        id: '3',
        type: 'status_change',
        title: 'Case opened',
        description: 'New matter created in the system.',
        timestamp: '2026. március 12., 09:00',
        author: 'Dr. Szabó Péter',
        avatarInitials: 'SP'
      }
    ],
    aiInsights: [
      {
        id: '1',
        type: 'suggestion',
        title: 'Board meeting quorum clarification',
        description: 'Consider adding explicit quorum requirements for board meetings to avoid ambiguity.',
        severity: 'medium'
      }
    ],
    relatedDocuments: [
      { id: 'doc-1', name: 'tarsasagi_szabalyzat_modositas_v1.docx', type: 'Bylaw', date: '2026-03-17', status: 'Ready', linkedTimelineId: '1', version: 'v1' },
      { id: 'doc-2', name: 'hatarozat_minta.docx', type: 'Resolution', date: '2026-03-15', status: 'Ready', version: 'template' },
    ],
    partnerInstructions: [
      {
        id: '1',
        title: 'Board composition review',
        description: 'Review current board member structure and propose improvements.',
        createdAt: '2026. március 15.',
        author: 'Dr. Szabó Péter'
      }
    ],
  },
  'AD-2026-0061': {
    caseId: 'AD-2026-0061',
    client: 'Kiss Bt.',
    matterName: 'Litigation response filing',
    leadCounsel: 'Dr. Nagy Anna',
    workflowStatus: 'Client Input',
    practiceArea: 'Litigation',
    riskLevel: 'High',
    caseNav: 'timeline',
    createdDate: '2026-03-08',
    lastActivity: 'Yesterday',
    deadline: '2026-03-30',
    description: 'Response to civil litigation filed by former business partner regarding breach of contract claims.',
    timeline: [
      {
        id: '1',
        type: 'client_added',
        title: 'Client meeting',
        description: 'Initial consultation with client to gather facts.',
        timestamp: '2026. március 16., 11:00',
        author: 'Dr. Nagy Anna',
        avatarInitials: 'NA'
      },
      {
        id: '2',
        type: 'status_change',
        title: 'Case opened',
        description: 'New litigation matter created.',
        timestamp: '2026. március 08., 09:00',
        author: 'Dr. Nagy Anna',
        avatarInitials: 'NA'
      }
    ],
    aiInsights: [
      {
        id: '1',
        type: 'risk',
        title: 'Statute of limitations concern',
        description: 'Response deadline is approaching. Ensure filing within statutory period.',
        severity: 'high'
      }
    ],
    relatedDocuments: [
      { id: 'doc-1', name: 'keresetlevel.pdf', type: 'Pleadings', date: '2026-03-08', status: 'Review Needed', linkedTimelineId: '2', version: 'original' },
      { id: 'doc-2', name: 'szerzodes_masolat.pdf', type: 'Contract', date: '2026-03-05', status: 'Ready', version: 'original' },
    ],
    partnerInstructions: [
      {
        id: '1',
        title: 'Evidence compilation',
        description: 'Gather all relevant contracts and correspondence for defense.',
        createdAt: '2026. március 16.',
        author: 'Dr. Nagy Anna'
      }
    ],
  },
  'AD-2026-0068': {
    caseId: 'AD-2026-0068',
    client: 'Szabo Zrt.',
    matterName: 'Registry compliance and closure memo',
    leadCounsel: 'Dr. Kovacs Marianna',
    workflowStatus: 'Approved',
    practiceArea: 'Corporate',
    riskLevel: 'Low',
    caseNav: 'timeline',
    createdDate: '2026-02-20',
    lastActivity: '3 days ago',
    description: 'Final compliance review and registry closure documentation for voluntary dissolution.',
    timeline: [
      {
        id: '1',
        type: 'status_change',
        title: 'Approved',
        description: 'Final approval granted by senior counsel.',
        timestamp: '2026. március 10., 16:00',
        author: 'Dr. Kovács Marianna',
        avatarInitials: 'KM',
        statusLabel: 'Approved'
      },
      {
        id: '2',
        type: 'document_upload',
        title: 'Closure memo uploaded',
        description: 'Final closure memorandum prepared.',
        timestamp: '2026. március 08., 14:00',
        author: 'Dr. Kovács Marianna',
        avatarInitials: 'KM',
        documentName: 'zarasi_jegyzokonyv_final.docx'
      }
    ],
    aiInsights: [],
    relatedDocuments: [
      { id: 'doc-1', name: 'zarasi_jegyzokonyv_final.docx', type: 'Memo', date: '2026-03-08', status: 'Ready', linkedTimelineId: '2', version: 'final' },
      { id: 'doc-2', name: 'cegbirosagi_beadas.pdf', type: 'Filing', date: '2026-03-01', status: 'Archived', version: 'original' },
    ],
    partnerInstructions: [],
  },
};

export const caseNavItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'documents', label: 'Documents' },
  { id: 'team', label: 'Team' },
];
