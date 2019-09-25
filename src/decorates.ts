import 'reflect-metadata';
import { ProviderServiceChunkMethodParametersSchema, ProviderContext } from 'dubbo.ts';
import { ComposeMiddleware, Compose } from '@typeservice/core';

type ContextRequestType = ProviderContext['req'];

export enum NAMESPACE {
  DELAY = 'rpc.delay',
  DESCRIPTION = 'rpc.description',
  GROUP = 'rpc.group',
  INTERFACE = 'rpc.interface',
  METHOD = 'rpc.method',
  RETRIES = 'rpc.retries',
  TIMEOUT = 'rpc.timeout',
  VERSION = 'rpc.version',
  REQ = 'rpc.req',
  MIDDLEWARE = 'rpc.middleware',
  SWAGGER_REQUEST_SCHEMA = 'rpc.method.swagger.schema.request',
  SWAGGER_RESPONSE_SCHEMA = 'rpc.method.swagger.schema.response',
  SWAGGER_SUMMARY = 'rpc.method.swagger.summary',
}

export function Delay(time?: number): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.DELAY, time || -1, target);
  }
}

export function Description(str: string): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.DESCRIPTION, str, target);
  }
}

export function Group(group: string): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.GROUP, group, target);
  }
}

export function Interface(name: string): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.INTERFACE, name, target);
  }
}

export function Method(target: Object, property: string | symbol, descriptor: TypedPropertyDescriptor<(...args: any[]) => any>) {
  Reflect.defineMetadata(NAMESPACE.METHOD, true, descriptor.value);
}

export function Retries(count?: number): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.RETRIES, count || 2, target);
  }
}

export function Timeout(time?: number): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.TIMEOUT, time || 3000, target);
  }
}

export function Version(version?: string): ClassDecorator {
  return target => {
    Reflect.defineMetadata(NAMESPACE.VERSION, version || '0.0.0', target);
  }
}

export const Swagger = {
  Request(...schemas: ProviderServiceChunkMethodParametersSchema[]): MethodDecorator {
    return (target, property, descriptor) => {
      Reflect.defineMetadata(NAMESPACE.SWAGGER_REQUEST_SCHEMA, schemas, descriptor.value);
    }
  },
  Response(schema: any): MethodDecorator {
    return (target, property, descriptor) => {
      Reflect.defineMetadata(NAMESPACE.SWAGGER_RESPONSE_SCHEMA, schema, descriptor.value);
    }
  },
  Summary(str: string): MethodDecorator {
    return (target, property, descriptor) => {
      Reflect.defineMetadata(NAMESPACE.SWAGGER_SUMMARY, str, descriptor.value);
    }
  }
}

export class ParameterMetadata {
  private readonly parameters: ((req: ContextRequestType) => any)[] = [];
  set(index: number, callback: (req: ContextRequestType) => any) {
    this.parameters[index] = callback;
    return this;
  }
  exec(req: ContextRequestType) {
    return this.parameters.map((fn, index) => {
      if (typeof fn === 'function') return fn(req);
      return req.parameters[index];
    });
  }

  static bind(target: Object) {
    let meta: ParameterMetadata;
    if (!Reflect.hasMetadata(NAMESPACE.REQ, target)) {
      meta = new ParameterMetadata();
      Reflect.defineMetadata(NAMESPACE.REQ, meta, target);
    } else {
      meta = Reflect.getMetadata(NAMESPACE.REQ, target) as ParameterMetadata;
    }
    return meta;
  }
}

type AttachmentItemType = ContextRequestType['attachments'][keyof ContextRequestType['attachments']];

export const ctx = {
  id: setParameterMetaData<ContextRequestType['requestId']>(req => req.requestId),
  dv: setParameterMetaData<ContextRequestType['dubboVersion']>(req => req.dubboVersion),
  name: setParameterMetaData<ContextRequestType['interfaceName']>(req => req.interfaceName),
  method: setParameterMetaData<ContextRequestType['method']>(req => req.method),
  version: setParameterMetaData<ContextRequestType['interfaceVersion']>(req => req.interfaceVersion),
  attachments: setParameterMetaData<ContextRequestType['attachments']>(req => req.attachments),
  attachment: setFunctionalParameterMetaData<AttachmentItemType>((req, key: keyof ContextRequestType['attachments']) => req.attachments[key]),
  params: setParameterMetaData<ContextRequestType['parameters']>(req => req.parameters),
  param: setFunctionalParameterMetaData((req, index: number) => req.parameters[index]),
}

export function setParameterMetaData<T = any>(callback: (req: ContextRequestType) => T): ParameterDecorator {
  return (target, property, index) => {
    const clazz = target.constructor.prototype[property];
    const meta = ParameterMetadata.bind(clazz);
    meta.set(index, callback);
  }
}

export function setFunctionalParameterMetaData<T = any>(callback: (req: ContextRequestType, ...args: any[]) => T) {
  return (...args: any[]): ParameterDecorator => {
    return (target, property, index) => {
      const clazz = target.constructor.prototype[property];
      const meta = ParameterMetadata.bind(clazz);
      meta.set(index, (req) => callback(req, ...args));
    }
  }
}

export class MiddlewareMetadata<T extends ProviderContext = ProviderContext>{
  private readonly stacks: ComposeMiddleware<T>[] = [];
  use(...args: ComposeMiddleware<T>[]) {
    this.stacks.unshift(...args);
    return this;
  }
  exec(ctx: T, fn?: ComposeMiddleware<T>) {
    const stacks = this.stacks.slice(0);
    fn && stacks.push(fn);
    return Compose<T>(stacks)(ctx);
  }
}

export function Middleware<T extends ProviderContext = ProviderContext>(...args: ComposeMiddleware<T>[]): MethodDecorator {
  return (target, property, descriptor) => {
    const clazz = descriptor.value;
    if (!Reflect.hasMetadata(NAMESPACE.MIDDLEWARE, clazz)) Reflect.defineMetadata(NAMESPACE.MIDDLEWARE, new MiddlewareMetadata<T>(), clazz);
    const metadata = Reflect.getMetadata(NAMESPACE.MIDDLEWARE, clazz) as MiddlewareMetadata<T>;
    metadata.use(...args);
  }
}