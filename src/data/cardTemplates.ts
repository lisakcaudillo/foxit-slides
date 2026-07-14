import type { CardTemplate } from '../types/card-template';

export const PROJECT_BRIEF_TEMPLATE: CardTemplate = {
  id: 'tpl-project-brief',
  name: 'Project Brief',
  description: 'Kick off any project with clear objectives, scope, timeline, and ownership.',
  category: 'operations',
  thumbnail: '/templates/project-brief.png',
  theme: {
    pageBg: '#F0F0F8',
    cardBg: 'rgba(243, 243, 255, 0.75)',
    cardBgOpacity: 0.75,
    cardRadius: 12,
    cardPadding: 64,
    accentColors: ['#2D4DF2', '#018CE1', '#DA33BF', '#F57C00'],
    headingFont: 'Inter',
    bodyFont: 'Inter',
    headingColor: '#00002E',
    bodyColor: '#4D4D51',
  },
  cards: [
    {
      id: 'pb-hero',
      layout: 'split-left',
      style: 'default',
      accent: { type: 'gradient', value: 'linear-gradient(135deg, #667eea, #764ba2)', position: 'left' },
      columns: [{
        blocks: [
          { type: 'heading', level: 1, content: 'Your Project Name' },
          { type: 'paragraph', content: 'A brief description of what this project is about and the key outcome it aims to achieve.' },
          { type: 'label-group', labels: [
            { text: 'Timeline', style: 'outline' },
            { text: 'Team / Department', style: 'outline' },
          ]},
        ],
      }],
    },
    {
      id: 'pb-objective',
      layout: 'single',
      style: 'default',
      columns: [{
        blocks: [
          { type: 'heading', level: 2, content: 'Objective' },
          { type: 'heading', level: 3, content: "What We're Building & Why" },
          { type: 'paragraph', content: 'Describe the problem you are solving and why it matters. What is the current state, and what will be different when this project is complete?' },
          { type: 'smart-layout', variant: 'grid-2x2', cells: [
            { icon: 'target', heading: 'Primary Goal', body: 'The main measurable outcome this project will deliver', accentColor: '#2D4DF2' },
            { icon: 'calendar', heading: 'Timeline', body: 'Expected duration and key date boundaries', accentColor: '#018CE1' },
            { icon: 'users', heading: 'Team Size', body: 'Number of people and their roles', accentColor: '#DA33BF' },
            { icon: 'dollar', heading: 'Budget', body: 'Estimated cost including resources and tooling', accentColor: '#F57C00' },
          ]},
        ],
      }],
    },
    {
      id: 'pb-scope',
      layout: 'single',
      style: 'default',
      columns: [{
        blocks: [
          { type: 'heading', level: 2, content: 'Scope & Deliverables' },
          { type: 'toggle', heading: 'Deliverable 1', content: 'Describe what this deliverable includes, its acceptance criteria, and who owns it.' },
          { type: 'toggle', heading: 'Deliverable 2', content: 'Describe what this deliverable includes, its acceptance criteria, and who owns it.' },
          { type: 'toggle', heading: 'Deliverable 3', content: 'Describe what this deliverable includes, its acceptance criteria, and who owns it.' },
          { type: 'divider' },
          { type: 'label-group', labels: [
            { text: 'In Scope', style: 'filled' },
            { text: 'Tag 1', style: 'outline' },
            { text: 'Tag 2', style: 'outline' },
          ]},
        ],
      }],
    },
    {
      id: 'pb-timeline',
      layout: 'single',
      style: 'default',
      columns: [{
        blocks: [
          { type: 'heading', level: 2, content: 'Timeline' },
          { type: 'smart-layout', variant: 'timeline', cells: [
            { heading: 'Phase 1: Discovery', body: 'Research, interviews, and analysis to understand the problem space.', accentColor: '#2D4DF2' },
            { heading: 'Phase 2: Design', body: 'Wireframes, prototypes, and validation with stakeholders.', accentColor: '#018CE1' },
            { heading: 'Phase 3: Build', body: 'Implementation, integration, and quality assurance.', accentColor: '#DA33BF' },
            { heading: 'Phase 4: Launch', body: 'Rollout, monitoring, and retrospective.', accentColor: '#F57C00' },
          ]},
        ],
      }],
    },
    {
      id: 'pb-risks',
      layout: 'single',
      style: 'default',
      columns: [{
        blocks: [
          { type: 'heading', level: 2, content: 'Risks & Dependencies' },
          { type: 'smart-layout', variant: 'list', cells: [
            { icon: 'red-circle', heading: 'High-priority risk', body: 'Describe the risk, its potential impact, and your mitigation strategy.', accentColor: '#E53935' },
            { icon: 'yellow-circle', heading: 'Medium-priority risk', body: 'Describe the risk, its potential impact, and your mitigation strategy.', accentColor: '#F57C00' },
            { icon: 'yellow-circle', heading: 'Dependency or constraint', body: 'Describe external factors that could affect the timeline or outcome.', accentColor: '#F57C00' },
          ]},
          { type: 'callout', icon: 'warning', content: '**Open decision:** Note any decisions that need to be made before work can proceed, and by when.' },
        ],
      }],
    },
    {
      id: 'pb-next-steps',
      layout: 'split-right',
      style: 'default',
      accent: { type: 'gradient', value: 'linear-gradient(135deg, #2D4DF2, #6B3FA0)', position: 'right' },
      columns: [{
        blocks: [
          { type: 'heading', level: 2, content: 'Next Steps' },
          { type: 'bullet-list', items: [
            'Action item 1 -- **owner and deadline**',
            'Action item 2 -- **owner and deadline**',
            'Action item 3 -- **owner and deadline**',
            'Action item 4 -- **owner and deadline**',
          ]},
        ],
      }],
    },
  ],
};
