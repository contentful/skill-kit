import type { ReferenceBuilderConfig, ReferenceDefinition, TopicConfig } from './types.js';

export class ReferenceBuilder {
  private readonly config: ReferenceBuilderConfig;
  private readonly topics: Record<string, TopicConfig> = {};

  constructor(config: ReferenceBuilderConfig) {
    this.config = config;
  }

  topic(name: string, config: TopicConfig): ReferenceBuilder {
    this.topics[name] = config;
    return this;
  }

  build(): ReferenceDefinition {
    const { name, description } = this.config;

    if (!name) throw new Error('reference: name is required');
    if (!description) throw new Error('reference: description is required');
    if (Object.keys(this.topics).length === 0) throw new Error('reference: at least one topic is required');

    return Object.freeze({
      kind: 'reference' as const,
      name,
      version: this.config.version ?? '0.0.0',
      resolveVersion: this.config.resolveVersion ?? false,
      description,
      package: this.config.package,
      argumentHint: this.config.argumentHint,
      arguments: this.config.arguments,
      allowedTools: this.config.allowedTools,
      paths: this.config.paths,
      context: this.config.context,
      license: this.config.license,
      compatibility: this.config.compatibility,
      agent: this.config.agent,
      model: this.config.model,
      effort: this.config.effort,
      disableModelInvocation: this.config.disableModelInvocation,
      userInvocable: this.config.userInvocable,
      topics: Object.freeze({ ...this.topics }),
    });
  }
}
