import type { SkillDefinition, ReferenceLoader } from '../types.js';

export function handleTopics(def: SkillDefinition): void {
  if (!def.topics || Object.keys(def.topics).length === 0) {
    process.stderr.write('No topics available.\n');
    return;
  }
  for (const [name, topic] of Object.entries(def.topics)) {
    process.stdout.write(`${name}: ${topic.label}\n`);
  }
}

export function handleTopic(def: SkillDefinition, topicName: string, refs: ReferenceLoader): void {
  const topic = def.topics?.[topicName];
  if (!topic) {
    process.stderr.write(`error: unknown topic "${topicName}". Run with "topics" to list.\n`);
    process.exit(1);
  }
  const content = topic.content({ refs });
  process.stdout.write(content);
  if (!content.endsWith('\n')) process.stdout.write('\n');
}
