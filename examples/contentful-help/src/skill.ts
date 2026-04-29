import { skill, z, act } from '@contentful/skill-kit';
import doctorSkill from './subskills/doctor.js';
import setupSkill from './subskills/setup.js';

export default skill({
  name: 'contentful-help',
  version: '1.0.0',
  description: 'Diagnose, configure, and look up Contentful topics.',
  triggers: ['contentful help', 'contentful doctor', 'contentful setup'],
  argumentHint: '[doctor|setup]',
  disableModelInvocation: true,
  entry: 'choose',
  stash: z.object({ intent: z.string(), spaceId: z.string() }),
})
  .step('choose', {
    prompt: act.askUser({
      type: 'structured',
      question: 'What would you like help with?',
      options: [
        { value: 'doctor', label: 'Diagnose issues', description: 'Find and fix problems in your space' },
        { value: 'setup', label: 'Set up Contentful', description: 'Configure your space or environment' },
        { value: 'faq', label: 'Quick question', description: 'Look up reference information' },
      ],
    }),
    output: z.object({ choice: z.enum(['doctor', 'setup', 'faq']) }),
    updateStash: ({ stepOutput }) => ({ intent: stepOutput.choice, spaceId: '' }),
    next: ({ stepOutput }) => {
      if (stepOutput.choice === 'faq') return 'ask-topic';
      if (stepOutput.choice === 'doctor') return 'get-space';
      return `subskill:${stepOutput.choice}`;
    },
  })

  .step('get-space', {
    prompt: 'Ask the user for their Contentful space ID, or detect it from CONTENTFUL_SPACE_ID in the environment.',
    output: z.object({ spaceId: z.string() }),
    updateStash: ({ stepOutput }) => ({ intent: 'doctor', spaceId: stepOutput.spaceId }),
    next: 'subskill:doctor',
  })

  .step('ask-topic', {
    prompt: act.askUser({ type: 'open', question: 'What would you like to know about?' }),
    output: z.object({ topicName: z.string() }),
    next: ({ stepOutput }) => `topic:${stepOutput.topicName}`,
  })

  .topic('rate-limits', {
    label: 'API rate limits and throttling',
    content: ({ refs }) => refs.load('rate-limits.md'),
  })
  .topic('locales', {
    label: 'Content localization and locale configuration',
    content: ({ refs }) => refs.load('locales.md'),
  })

  .subskill('doctor', doctorSkill, {
    params: (_output, stash) => ({ spaceId: (stash as { spaceId: string }).spaceId }),
  })
  .subskill('setup', setupSkill)

  .build();
