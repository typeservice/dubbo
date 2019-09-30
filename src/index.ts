import * as path from 'path';
import * as globby from 'globby';
import { Container, interfaces } from 'inversify';
import { WorkerFactory, Logger, ProcessException, RequireFileWithDefault } from '@typeservice/core';
import * as rpc from './decorates';
import Context from './context';
import { 
  Provider, 
  Consumer, 
  Registry, 
  SwaggerProvider, 
  ProviderInitOptions, 
  ConsumerServiceInitOptions, 
  RegistryInitOptions,
  ProviderContext, 
  ProviderChunk,
  PROVIDER_CONTEXT_STATUS,
  ProviderServiceChunkMethodParametersOptions,
} from 'dubbo.ts';

export type DubboOptionsByProviderIncluded = Pick<ProviderInitOptions, 'application' | 'dubbo_version' | 'port' | 'heartbeat'>;
type DubboOptionsByProviderExcluded = Pick<ProviderInitOptions, 'pid' | 'registry' | 'logger'>;
export type DubboOptionsByConsumerIncluded = Pick<ConsumerServiceInitOptions, 'application' | 'dubbo_version' | 'pickTimeout'>;
type DubboOptionsByConsumerExcluded = Pick<ConsumerServiceInitOptions, 'pid' | 'registry' | 'logger'>;

export type DubboOptions = {
  provider: DubboOptionsByProviderIncluded,
  consumer?: DubboOptionsByConsumerIncluded,
  registry: RegistryInitOptions,
  swagger?: string,
  logger?: Logger,
  container?: interfaces.ContainerOptions,
  version?: string,
}

export {
  rpc,
  Context,
}

export default class Dubbo extends WorkerFactory {
  public readonly provider: Provider;
  public readonly consumer: Consumer;
  public readonly registry: Registry;
  public readonly swagger: SwaggerProvider;
  public readonly container: Container;
  private readonly version: string;

  constructor(options: DubboOptions) {
    super(options.logger);
    this.version = options.version;
    this.container = new Container(options.container);
    this.registry = new Registry(options.registry);
    const provider_options = Object.assign<DubboOptionsByProviderIncluded, DubboOptionsByProviderExcluded>(options.provider, {
      pid: process.pid,
      registry: this.registry,
      logger: this.logger,
    })
    this.provider = new Provider(provider_options);
    if (options.consumer) {
      const consumer_options = Object.assign<DubboOptionsByConsumerIncluded, DubboOptionsByConsumerExcluded>(options.consumer, {
        pid: process.pid,
        registry: this.registry,
        logger: this.logger,
      });
      this.consumer = new Consumer(consumer_options);
    }
    if (options.swagger) {
      this.swagger = new SwaggerProvider(options.swagger, this.provider, this.logger);
    }

    this.on('setup', this.setup.bind(this));
    this.on('exit', this.exit.bind(this));
    this.on('error', this.error.bind(this));
    this.provider.on('data', this.onData.bind(this));
  }

  scan(dir: string, cwd: string = process.cwd()) {
    const dictionary = path.resolve(cwd, dir);
    const dictionaries = globby.sync([
      '**/*.ts',
      '**/*.js',
      '!**/*.d.ts'
    ], {
      cwd: dictionary
    });
    dictionaries.forEach(dic => {
      const clazz = RequireFileWithDefault<interfaces.Newable<any>>(dic, dictionary);
      this.bind(clazz.name, clazz);
    });
  }

  bind<T = any>(name: string, target: interfaces.Newable<T>) {
    const properties = Object.getOwnPropertyNames(target.prototype);
    const methods: string[] = [], swaggers: ProviderServiceChunkMethodParametersOptions[] = [];
    const interfacename = Reflect.getMetadata(rpc.NAMESPACE.INTERFACE, target) as string;
    const version = Reflect.getMetadata(rpc.NAMESPACE.VERSION, target) as string;
    const group = Reflect.getMetadata(rpc.NAMESPACE.GROUP, target) as string;
    const deplay = Reflect.getMetadata(rpc.NAMESPACE.DELAY, target) as number;
    const retries = Reflect.getMetadata(rpc.NAMESPACE.RETRIES, target) as number;
    const timeout = Reflect.getMetadata(rpc.NAMESPACE.TIMEOUT, target) as number;
    const description = Reflect.getMetadata(rpc.NAMESPACE.DESCRIPTION, target) as string;
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const that = target.prototype[property];
      if (property === 'constructor') continue;
      const isMethod = Reflect.getMetadata(rpc.NAMESPACE.METHOD, that) as boolean;
      const swagger_request_schema = Reflect.getMetadata(rpc.NAMESPACE.SWAGGER_REQUEST_SCHEMA, that);
      const swagger_response_schema = Reflect.getMetadata(rpc.NAMESPACE.SWAGGER_RESPONSE_SCHEMA, that);
      const swagger_summary = Reflect.getMetadata(rpc.NAMESPACE.SWAGGER_SUMMARY, that) as string;
      if (isMethod) {
        methods.push(property);
        const tmp: ProviderServiceChunkMethodParametersOptions = {
          name: property,
          input: []
        };
        if (swagger_response_schema) tmp.output = swagger_response_schema;
        if (swagger_summary) tmp.summary = swagger_summary;
        if (swagger_request_schema) tmp.input = swagger_request_schema;
        swaggers.push(tmp);
      }
    }
    if (interfacename && name && methods.length) {
      this.provider.addService(name, {
        interface: interfacename,
        revision: this.version || version || '0.0.0',
        version:  version || '0.0.0',
        group: group,
        methods: methods,
        delay: deplay || -1,
        retries: retries || 2,
        timeout: timeout || 60000,
        description,
        parameters: swaggers,
      })
    }
    return this.container.bind<T>(name).to(target);
  }

  private async setup() {
    await this.provider.listen();
    if (this.consumer) await this.consumer.listen();
    if (this.swagger) await this.swagger.publish();
  }

  private async exit() {
    if (this.swagger) await this.swagger.unPublish();
    await this.provider.close();
    if (this.consumer) await this.consumer.close();
  }

  private async error(error: ProcessException, name?: string) {
    this.logger.error(name, error);
  }

  private async onData(ctx: ProviderContext, chunk: ProviderChunk<string>) {
    const req = ctx.req;
    const provider_name = chunk.interfacetarget;
    const injector = this.container.get<any>(provider_name);

    if (!injector) {
      ctx.status = PROVIDER_CONTEXT_STATUS.SERVICE_NOT_FOUND;
      ctx.body = `cannot find the interface of ${chunk.interfacetarget}`;
      return;
    } 
    
    if (!injector[req.method]) {
      ctx.status = PROVIDER_CONTEXT_STATUS.SERVICE_NOT_FOUND;
      ctx.body = `cannot find the method of ${req.method} on ${chunk.interfacename}:${chunk.interfaceversion}@${chunk.interfacegroup}#${req.dubboVersion}`;
      return;
    }

    const structor = injector.constructor;
    const target = structor.prototype[req.method];
    const isMethod = Reflect.getMetadata(rpc.NAMESPACE.METHOD, target);
    if (!isMethod) {
      ctx.status = PROVIDER_CONTEXT_STATUS.SERVICE_NOT_FOUND;
      ctx.body = `cannot find the method of ${req.method} on ${chunk.interfacename}:${chunk.interfaceversion}@${chunk.interfacegroup}#${req.dubboVersion}`;
      return;
    }
    const hasMiddleware = Reflect.hasMetadata(rpc.NAMESPACE.MIDDLEWARE, target);
    const hasMeta = Reflect.hasMetadata(rpc.NAMESPACE.REQ, target);
    let error: Error;
    const context = new Context(ctx);
    try {
      await this.sync('context:start', context, target);
      if (!hasMiddleware) {
        if (!hasMeta) {
          ctx.body = await injector[req.method](...req.parameters);
        } else {
          const meta = Reflect.getMetadata(rpc.NAMESPACE.REQ, target) as rpc.ParameterMetadata;
          const args = await meta.exec(context);
          ctx.body = await injector[req.method](...args);
        }
      } else {
        const middlewareMetadata = Reflect.getMetadata(rpc.NAMESPACE.MIDDLEWARE, target) as rpc.MiddlewareMetadata;
        await middlewareMetadata.exec(context, async (ctx, next) => {
          if (!hasMeta) {
            ctx.body = await injector[req.method](...req.parameters);
          } else {
            const meta = Reflect.getMetadata(rpc.NAMESPACE.REQ, target) as rpc.ParameterMetadata;
            const args = await meta.exec(context);
            ctx.body = await injector[req.method](...args);
          }
          await next();
        });
      }
    } catch(e) { 
      error = e; 
      ctx.body = e.message;
      ctx.status = e.code || PROVIDER_CONTEXT_STATUS.SERVICE_ERROR;
    }
    await context.sync('stop', error);
    await this.sync('context:stop', context, error);
  }
}