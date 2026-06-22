export const annualTaskTemplates = [
  {
    id: 'template-pruning',
    title: 'Winter pruning',
    recommendedMonth: 1,
    notes: 'Shape canopy for sunlight and airflow.',
  },
  {
    id: 'template-fertilizer',
    title: 'Spring fertilization',
    recommendedMonth: 3,
    notes: 'Apply balanced fertilizer before rapid growth.',
  },
  {
    id: 'template-pest-scan',
    title: 'Integrated pest scouting',
    recommendedMonth: 5,
    notes: 'Inspect leaves/fruit weekly and log pest pressure.',
  },
  {
    id: 'template-fruit-thinning',
    title: 'Fruit thinning',
    recommendedMonth: 7,
    notes: 'Control fruit load to improve quality and size.',
  },
  {
    id: 'template-brix-check',
    title: 'Pre-harvest Brix check',
    recommendedMonth: 10,
    notes: 'Sample fruit sugar levels and adjust harvest timing.',
  },
  {
    id: 'template-greenhouse-service',
    title: 'Greenhouse equipment maintenance',
    recommendedMonth: 11,
    notes: 'Inspect venting, drip lines, heaters, and sensors.',
  },
]

export const defaultFacilities = [
  {
    id: 'house-1',
    name: 'Greenhouse 1',
    area: 320,
    trees: 100,
    notes: 'Hallabong and Karahyang mixed block.',
  },
  {
    id: 'house-2',
    name: 'Greenhouse 2',
    area: 330,
    trees: 100,
    notes: 'Higher morning humidity, monitor ventilation.',
  },
  {
    id: 'house-3',
    name: 'Greenhouse 3',
    area: 315,
    trees: 100,
    notes: 'More sun exposure, monitor irrigation closely.',
  },
  {
    id: 'house-4',
    name: 'Greenhouse 4',
    area: 325,
    trees: 100,
    notes: 'Good airflow section, ideal for pilot trials.',
  },
]

export const defaultSeedlings = [
  {
    id: 'seedling-1',
    greenhouseId: 'house-1',
    variety: 'Hallabong',
    quantity: 60,
    plantedAt: '2025-03-20',
    rootstock: 'Poncirus trifoliata',
    notes: 'Stable flowering and consistent fruit set.',
  },
  {
    id: 'seedling-2',
    greenhouseId: 'house-1',
    variety: 'Karahyang',
    quantity: 40,
    plantedAt: '2025-03-20',
    rootstock: 'Citrange',
    notes: 'Needs careful winter temperature control.',
  },
  {
    id: 'seedling-3',
    greenhouseId: 'house-2',
    variety: 'Hallabong',
    quantity: 55,
    plantedAt: '2025-03-23',
    rootstock: 'Poncirus trifoliata',
    notes: 'Watch for mites during dry periods.',
  },
  {
    id: 'seedling-4',
    greenhouseId: 'house-2',
    variety: 'Karahyang',
    quantity: 45,
    plantedAt: '2025-03-23',
    rootstock: 'Citrange',
    notes: 'Good vigor under moderate fertigation.',
  },
]

export const defaultTasks = [
  {
    id: 'task-1',
    title: 'Check drip line pressure',
    greenhouseId: 'house-1',
    dueDate: '2026-06-22',
    frequency: 'weekly',
    category: 'Irrigation',
    status: 'todo',
    progress: 0,
    logs: [],
  },
  {
    id: 'task-2',
    title: 'Leaf miner scouting',
    greenhouseId: 'house-3',
    dueDate: '2026-06-24',
    frequency: 'weekly',
    category: 'Pest',
    status: 'in-progress',
    progress: 30,
    logs: [
      {
        date: '2026-06-21T09:30:00.000Z',
        note: 'Spotted minor damage on edge rows. Sticky cards replaced.',
      },
    ],
  },
]

export const defaultScheduleRules = [
  {
    id: 'schedule-1',
    title: 'Weekly humidity check',
    greenhouseId: 'house-2',
    category: 'Environment',
    frequency: 'weekly',
    interval: 1,
    dayOfWeek: 1,
    dayOfMonth: 1,
    startDate: '2026-06-01',
    endDate: '',
    enabled: true,
  },
  {
    id: 'schedule-2',
    title: 'Monthly nutrient EC calibration',
    greenhouseId: 'house-1',
    category: 'Fertigation',
    frequency: 'monthly',
    interval: 1,
    dayOfWeek: 1,
    dayOfMonth: 5,
    startDate: '2026-06-01',
    endDate: '',
    enabled: true,
  },
]

export const defaultScheduleSettings = {
  generationDays: 21,
  duplicatePolicy: 'rule-and-date',
}

export const defaultIssues = [
  {
    id: 'issue-1',
    title: 'High humidity in early morning',
    greenhouseId: 'house-2',
    occurredAt: '2026-06-18',
    status: 'resolved',
    symptoms: 'Condensation on leaf surface and slower transpiration.',
    resolutionSteps: [
      {
        date: '2026-06-18T22:00:00.000Z',
        note: 'Adjusted vent open timing by +30 minutes before sunrise.',
      },
      {
        date: '2026-06-20T22:00:00.000Z',
        note: 'Added circulation fan cycle for 15 minutes each hour.',
      },
    ],
    photos: [],
  },
]
