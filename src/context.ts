import { EventEmitter } from '@typeservice/core';
import { ProviderContext, PROVIDER_CONTEXT_STATUS } from 'dubbo.ts';

export default class Context extends EventEmitter {
  constructor(private readonly ctx: ProviderContext) {
    super();
  }

  get req() {
    return this.ctx.req;
  }

  get status() {
    return this.ctx.status;
  }

  set status(value: PROVIDER_CONTEXT_STATUS) {
    this.ctx.status = value;
  }

  get body() {
    return this.ctx.body;
  }

  set body(value: any) {
    this.ctx.body = value;
  }
}